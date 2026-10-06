// Audio helpers for on-device Whisper. The pure functions at the top are plain,
// erasable TypeScript (no imports, no enums) so they run under
// `node --experimental-strip-types` (see tests/audio.test.mjs). The browser-only
// capture/decode helpers live at the bottom and are only called client-side.

export const WHISPER_RATE = 16000

/** Average interleaved-by-channel arrays into one mono signal. */
export function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0)
  if (channels.length === 1) return channels[0]
  const n = channels[0].length
  const out = new Float32Array(n)
  for (const ch of channels) for (let i = 0; i < n; i++) out[i] += ch[i]
  for (let i = 0; i < n; i++) out[i] /= channels.length
  return out
}

/** Linear-interpolation resample. Good enough for speech at 16 kHz. */
export function resample(input: Float32Array, fromRate: number, toRate: number = WHISPER_RATE): Float32Array {
  if (fromRate === toRate || input.length === 0) return input
  const ratio = fromRate / toRate
  const outLen = Math.max(1, Math.floor(input.length / ratio))
  const out = new Float32Array(outLen)
  // When downsampling, box-average over the source window to limit aliasing.
  const win = ratio > 1 ? Math.ceil(ratio) : 1
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio
    if (win > 1) {
      const start = Math.floor(pos)
      const end = Math.min(input.length, start + win)
      let sum = 0
      for (let j = start; j < end; j++) sum += input[j]
      out[i] = sum / Math.max(1, end - start)
    } else {
      const i0 = Math.floor(pos)
      const i1 = Math.min(input.length - 1, i0 + 1)
      const f = pos - i0
      out[i] = input[i0] * (1 - f) + input[i1] * f
    }
  }
  return out
}

/** Scale quiet audio up so its peak reaches `target` (max gain `maxGain`); Whisper does poorly on very quiet input. */
export function normalizePeak(samples: Float32Array, target = 0.8, maxGain = 30): Float32Array {
  let peak = 0
  for (let i = 0; i < samples.length; i++) { const a = Math.abs(samples[i]); if (a > peak) peak = a }
  if (peak < 1e-4) return samples
  const gain = Math.min(maxGain, target / peak)
  if (gain <= 1) return samples
  const out = new Float32Array(samples.length)
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * gain
  return out
}

export function rms(samples: Float32Array, start = 0, end = samples.length): number {
  const e = Math.min(end, samples.length)
  const s = Math.max(0, start)
  if (e <= s) return 0
  let sum = 0
  for (let i = s; i < e; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / (e - s))
}

export interface ChunkerOptions {
  sampleRate?: number // default 16000
  minSec?: number // do not emit before this much audio (default 3)
  maxSec?: number // force a split at this length (default 12)
  overlapSec?: number // audio re-fed after a FORCED split (default 0.6)
  silenceMs?: number // trailing quiet needed to split early (default 450)
  silenceRms?: number // RMS below this counts as quiet (default 0.006)
}

/**
 * Streaming chunker: feed 16 kHz mono samples, get back chunks to transcribe.
 * Splits early on a trailing pause (no overlap needed), or forces a split at
 * maxSec keeping a small overlap (dedupe the text with joinTranscript).
 * Chunks that are entirely quiet are dropped.
 */
export class Chunker {
  private buf: Float32Array = new Float32Array(0)
  private rate: number
  private minN: number
  private maxN: number
  private overlapN: number
  private silN: number
  private silRms: number

  constructor(opts: ChunkerOptions = {}) {
    this.rate = opts.sampleRate ?? WHISPER_RATE
    this.minN = Math.round((opts.minSec ?? 3) * this.rate)
    this.maxN = Math.round((opts.maxSec ?? 12) * this.rate)
    this.overlapN = Math.round((opts.overlapSec ?? 0.6) * this.rate)
    this.silN = Math.round(((opts.silenceMs ?? 450) / 1000) * this.rate)
    this.silRms = opts.silenceRms ?? 0.006
  }

  get buffered(): number {
    return this.buf.length
  }

  push(samples: Float32Array): Float32Array[] {
    const joined = new Float32Array(this.buf.length + samples.length)
    joined.set(this.buf, 0)
    joined.set(samples, this.buf.length)
    this.buf = joined
    const out: Float32Array[] = []
    for (;;) {
      if (this.buf.length >= this.minN && rms(this.buf, this.buf.length - this.silN) < this.silRms) {
        // Pause detected at the tail: emit everything, no overlap.
        this.emit(out, this.buf)
        this.buf = new Float32Array(0)
      } else if (this.buf.length >= this.maxN) {
        const chunk = this.buf.slice(0, this.maxN)
        this.emit(out, chunk)
        this.buf = this.buf.slice(this.maxN - this.overlapN)
      } else break
    }
    return out
  }

  /** Emit whatever is left (call when recording stops). */
  flush(): Float32Array[] {
    const out: Float32Array[] = []
    if (this.buf.length > Math.round(0.3 * this.rate)) this.emit(out, this.buf)
    this.buf = new Float32Array(0)
    return out
  }

  private emit(out: Float32Array[], chunk: Float32Array) {
    if (rms(chunk) >= this.silRms * 0.3) out.push(chunk)
  }
}

/** Remove Whisper non-speech tags such as [BLANK_AUDIO], (music), *sigh*. */
export function cleanTranscript(text: string): string {
  return text
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\((?:[^)]*)\)/g, ' ')
    .replace(/\*[^*]*\*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '')

/** Append `next` to `prev`, dropping a duplicated word run caused by chunk overlap. */
export function joinTranscript(prev: string, next: string, maxOverlapWords = 8): string {
  const a = prev.trim()
  const b = next.trim()
  if (!a) return b
  if (!b) return a
  const aw = a.split(/\s+/)
  const bw = b.split(/\s+/)
  const limit = Math.min(maxOverlapWords, aw.length, bw.length)
  for (let k = limit; k >= 1; k--) {
    let same = true
    for (let i = 0; i < k; i++) {
      const x = norm(aw[aw.length - k + i])
      if (!x || x !== norm(bw[i])) {
        same = false
        break
      }
    }
    if (same) return [...aw, ...bw.slice(k)].join(' ')
  }
  return a + ' ' + b
}

// ---------------------------------------------------------------------------
// Browser-only below.
// ---------------------------------------------------------------------------

/** Decode any browser-supported audio Blob (webm/opus, mp4, wav…) to 16 kHz mono. */
export async function decodeBlobTo16kMono(blob: Blob): Promise<Float32Array> {
  const Ctx: typeof AudioContext = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext
  const ctx = new Ctx()
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer())
    const chans: Float32Array[] = []
    for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c))
    return resample(mixToMono(chans), buf.sampleRate, WHISPER_RATE)
  } finally {
    ctx.close().catch(() => {})
  }
}

const WORKLET_SRC = `
class Cap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (ch && ch.length) this.port.postMessage(ch.slice(0))
    return true
  }
}
registerProcessor('forray-capture', Cap)
`

export type MicErrorKind = 'permission' | 'no-mic' | 'in-use' | 'unsupported' | 'busy' | 'other'

/** Map a getUserMedia / setup error to a friendly message. Pure. */
export function describeMicError(e: any): { kind: MicErrorKind; message: string } {
  const name = String(e?.name ?? '')
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError')
    return { kind: 'permission', message: 'Microphone permission was denied. Allow it in your browser settings to record.' }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError')
    return { kind: 'no-mic', message: 'No microphone was found on this device.' }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError' || name === 'OverconstrainedError')
    return { kind: 'in-use', message: 'Another app or browser tab is using the microphone. Close it and try again.' }
  if (name === 'RecorderUnsupported')
    return { kind: 'unsupported', message: 'This browser cannot record audio.' }
  if (name === 'RecorderBusy')
    return { kind: 'busy', message: 'Another recording is already starting. Try again in a moment.' }
  return { kind: 'other', message: `Could not start the microphone: ${e?.message ?? e}` }
}

/** Errors worth one retry with unconstrained `{audio:true}`. */
export function isRetryableMicError(e: any): boolean {
  const n = String(e?.name ?? '')
  return n === 'NotReadableError' || n === 'OverconstrainedError' || n === 'AbortError' || n === 'TrackStartError'
}

/** Suffix of the onnxruntime-web WASM files transformers.js uses ('.asyncify', or '' for Safari < 26 without WebGPU). */
export function ortVariantSuffix(ua: string = '', hasGpu = false): string {
  const m = /Version\/(\d+)[\d.]*.*Safari/.exec(ua)
  const safariBelow26 = !!m && !/Chrome|Chromium|CriOS|Android/.test(ua) && parseInt(m[1], 10) < 26
  return safariBelow26 && !hasGpu ? '' : '.asyncify'
}

export interface RecorderHandle {
  /** Stop capture; resolves with the full raw audio Blob (empty Blob if MediaRecorder unsupported). Safe to call twice. */
  stop(): Promise<{ blob: Blob; mimeType: string; durationMs: number }>
  /** 0..1 recent input level for a meter. */
  level(): number
}

export type InterruptReason = 'replaced' | 'hidden' | 'ended'

export interface StartRecorderOptions {
  /** Called with 16 kHz mono Float32 frames (~every 128-4096 samples) as they arrive. */
  onSamples: (samples: Float32Array) => void
  /**
   * Called when the capture was ended by something other than stop(): another
   * recorder started ('replaced'), the page was hidden ('hidden'), or the OS
   * took the mic ('ended'). The mic is already released; stop() still resolves
   * with the audio captured so far.
   */
  onInterrupted?: (reason: InterruptReason) => void
}

// App-wide singleton: only one capture may exist at a time (Android gives the mic to one consumer).
let activeCapture: { release: (reason: InterruptReason) => void } | null = null
let starting = false

/** Stop whatever capture is active (e.g. before handing the mic to SpeechRecognition). */
export function releaseActiveRecorder(reason: InterruptReason = 'replaced'): void {
  activeCapture?.release(reason)
}
export function isRecorderActive(): boolean {
  return !!activeCapture || starting
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function openMicStream(): Promise<MediaStream> {
  const md = navigator.mediaDevices
  if (!md?.getUserMedia) throw Object.assign(new Error('getUserMedia unavailable'), { name: 'RecorderUnsupported' })
  try {
    return await md.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
  } catch (e) {
    if (!isRetryableMicError(e)) throw e
    await sleep(400)
    return await md.getUserMedia({ audio: true })
  }
}

/**
 * Open the mic. Streams 16 kHz mono PCM to onSamples (AudioWorklet, falling back
 * to ScriptProcessor) while a MediaRecorder keeps the full raw audio.
 * Throws (use describeMicError) if permission is denied / no mic / mic busy.
 * Any previous capture in this page is stopped first; if setup fails after the
 * mic opened, every track and the AudioContext are released.
 */
export async function startRecorder(opts: StartRecorderOptions): Promise<RecorderHandle> {
  if (starting) throw Object.assign(new Error('already starting'), { name: 'RecorderBusy' })
  starting = true
  // Only one capture at a time: release the previous one and let the OS free the device.
  if (activeCapture) {
    activeCapture.release('replaced')
    await sleep(150)
  }
  let stream: MediaStream | null = null
  let ctx: AudioContext | null = null
  let cleanup: () => void = () => {}
  try {
    stream = await openMicStream()
    const Ctx: typeof AudioContext = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext
    ctx = new Ctx()
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {})
    const src = ctx.createMediaStreamSource(stream)
    const srcRate = ctx.sampleRate
    let lvl = 0
    const deliver = (frame: Float32Array) => {
      lvl = Math.max(rms(frame) * 4, lvl * 0.8)
      opts.onSamples(resample(frame, srcRate, WHISPER_RATE))
    }

    try {
      if (!ctx.audioWorklet) throw new Error('no worklet')
      const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'text/javascript' }))
      try {
        await ctx.audioWorklet.addModule(url)
      } finally {
        URL.revokeObjectURL(url)
      }
      const node = new AudioWorkletNode(ctx, 'forray-capture')
      node.port.onmessage = (e) => deliver(e.data as Float32Array)
      const mute = ctx.createGain()
      mute.gain.value = 0
      src.connect(node)
      node.connect(mute).connect(ctx.destination)
      cleanup = () => {
        node.port.onmessage = null
        try { src.disconnect() } catch { /* ignore */ }
        try { node.disconnect() } catch { /* ignore */ }
      }
    } catch {
      const node = ctx.createScriptProcessor(4096, 1, 1)
      node.onaudioprocess = (e) => deliver(new Float32Array(e.inputBuffer.getChannelData(0)))
      const mute = ctx.createGain()
      mute.gain.value = 0
      src.connect(node)
      node.connect(mute).connect(ctx.destination)
      cleanup = () => {
        node.onaudioprocess = null
        try { src.disconnect() } catch { /* ignore */ }
        try { node.disconnect() } catch { /* ignore */ }
      }
    }

    let rec: MediaRecorder | null = null
    const parts: BlobPart[] = []
    let mimeType = ''
    try {
      rec = new MediaRecorder(stream)
      mimeType = rec.mimeType
      rec.ondataavailable = (e) => e.data.size && parts.push(e.data)
      rec.start(1000)
    } catch {
      rec = null
    }
    const t0 = Date.now()
    const s = stream
    const c = ctx

    let result: Promise<{ blob: Blob; mimeType: string; durationMs: number }> | null = null
    const finalize = () => {
      if (result) return result
      removeListeners()
      if (activeCapture === me) activeCapture = null
      result = new Promise((resolve) => {
        const finish = () => {
          cleanup()
          s.getTracks().forEach((t) => t.stop())
          c.close().catch(() => {})
          resolve({
            blob: new Blob(parts, { type: mimeType || 'audio/webm' }),
            mimeType: mimeType || 'audio/webm',
            durationMs: Date.now() - t0,
          })
        }
        if (rec && rec.state !== 'inactive') {
          rec.onstop = finish
          try { rec.stop() } catch { finish() }
        } else finish()
      })
      return result
    }
    const interrupt = (reason: InterruptReason) => {
      if (result) return
      finalize()
      try { opts.onInterrupted?.(reason) } catch { /* ignore */ }
    }
    const onVis = () => { if (document.visibilityState === 'hidden') interrupt('hidden') }
    const onHide = () => interrupt('hidden')
    const removeListeners = () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', onHide)
    }
    const me = { release: interrupt }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', onHide)
    s.getAudioTracks().forEach((t) => t.addEventListener('ended', () => interrupt('ended')))
    activeCapture = me

    return { level: () => lvl, stop: () => finalize() }
  } catch (e) {
    try { cleanup() } catch { /* ignore */ }
    stream?.getTracks().forEach((t) => t.stop())
    ctx?.close().catch(() => {})
    throw e
  } finally {
    starting = false
  }
}
