// Online fallback transcription via the browser Web Speech API (SpeechRecognition).
// Used only when the on-device Whisper model is not available. SpeechRecognition owns the
// microphone while it runs, so it must NEVER run together with getUserMedia/MediaRecorder
// (utils/audio.ts). This module therefore never touches getUserMedia.

export interface WebSpeechCallbacks {
  /** Full transcript so far (finals + current interim). */
  onText: (text: string) => void
  /** Fatal, user-presentable error; recognition has stopped. */
  onError: (message: string) => void
  /** Another recorder/recognizer took over the microphone; the owner should finish and save. */
  onPreempted?: () => void
}

export function webSpeechSupported(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as any
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition)
}

export function describeSpeechError(code: string): string {
  switch (code) {
    case 'network':
      return 'Online speech recognition needs an internet connection and could not reach the service. Check your connection, or download the voice model for offline use.'
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone or speech recognition permission was denied. Allow it in your browser settings and try again.'
    case 'audio-capture':
      return 'No microphone was found, or another app is using it. Close other apps using the microphone and try again.'
    case 'language-not-supported':
      return 'Speech recognition does not support this language on this device.'
    default:
      return `Speech recognition stopped (${code}).`
  }
}

let current: { stop: () => Promise<string>; preempt: () => void } | null = null

/** Stop any running recognizer (so the mic is free for MediaRecorder). Resolves once it has ended. */
export async function stopActiveSpeech(): Promise<void> {
  const c = current
  if (!c) return
  c.preempt()
  await c.stop().catch(() => {})
}

export function useWebSpeech() {
  const supported = webSpeechSupported()

  /** Start live recognition. Returns a controller; stop() resolves with the final text. */
  function start(cb: WebSpeechCallbacks): { stop: () => Promise<string> } {
    if (!supported) throw new Error('Speech recognition is not available in this browser.')
    // Only one recognizer at a time.
    const prev = current
    prev?.preempt()
    prev?.stop().catch(() => {})
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    let wanted = true
    let finals = ''
    let interimText = ''
    let rec: any = null
    let ended: (() => void) | null = null
    let quickEnds = 0
    let lastStart = 0

    const emit = () => cb.onText(`${finals} ${interimText}`.replace(/\s+/g, ' ').trim())

    const begin = () => {
      rec = new Ctor()
      rec.continuous = true
      rec.interimResults = true
      rec.lang = navigator.language || 'en-US'
      rec.maxAlternatives = 1
      rec.onresult = (ev: any) => {
        let interim = ''
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i]
          const t = String(r[0]?.transcript ?? '').trim()
          if (r.isFinal) { if (t) finals = `${finals} ${t}`.trim() } else interim += ` ${t}`
        }
        interimText = interim.trim()
        emit()
      }
      rec.onerror = (ev: any) => {
        const code = String(ev?.error ?? 'unknown')
        if (code === 'no-speech' || code === 'aborted') return // benign; onend restarts
        wanted = false
        cb.onError(describeSpeechError(code))
      }
      rec.onend = () => {
        // Keep any interim words that never became final.
        if (interimText) { finals = `${finals} ${interimText}`.trim(); interimText = '' }
        if (wanted) {
          // Chrome ends sessions after silence; restart while the user is still recording.
          quickEnds = Date.now() - lastStart < 1000 ? quickEnds + 1 : 0
          if (quickEnds > 5) { wanted = false; cb.onError('Speech recognition keeps stopping. Try again.'); ended?.(); return }
          setTimeout(() => { if (wanted) { try { lastStart = Date.now(); begin() } catch { wanted = false; cb.onError('Could not restart speech recognition.'); ended?.() } } }, 250)
        } else ended?.()
      }
      lastStart = Date.now()
      rec.start()
    }
    begin()

    let stopping: Promise<string> | null = null
    const ctl = {
      preempt: () => { try { cb.onPreempted?.() } catch { /* ignore */ } },
      stop: () =>
        (stopping ??= new Promise<string>((resolve) => {
          wanted = false
          if (current === ctl) current = null
          const done = () => { clearTimeout(t); resolve(finals.trim()) }
          const t = setTimeout(done, 1500)
          ended = done
          try { rec?.stop() } catch { done() }
        })),
    }
    current = ctl
    return ctl
  }

  return { supported, start }
}
