// Whisper speech-to-text in a Web Worker (Transformers.js v4).
// Protocol (main -> worker): {type:'load', model} | {type:'transcribe', id, audio: Float32Array(16k mono), prompt?: string} | {type:'dispose'}
// Worker -> main: {type:'progress', ...} | {type:'ready', device} | {type:'result', id, text} | {type:'error', id?, message}
import { pipeline, env } from '@huggingface/transformers'
import { joinTranscript, ortVariantSuffix } from '../utils/audio'

env.allowLocalModels = false
env.useBrowserCache = true // Cache API 'transformers-cache'; survives offline

// Self-hosted ONNX WASM runtime (copied to public/ort/ by scripts/copy-ort.mjs) instead of jsdelivr.
// transformers.js also stores these in its own Cache API wasm cache.
{
  const suffix = ortVariantSuffix(self.navigator?.userAgent ?? '', !!(self.navigator as any)?.gpu)
  const base = new URL('/ort/', self.location.origin).href
  const wasm = (env.backends as any)?.onnx?.wasm
  if (wasm) wasm.wasmPaths = { mjs: `${base}ort-wasm-simd-threaded${suffix}.mjs`, wasm: `${base}ort-wasm-simd-threaded${suffix}.wasm` }
}

const REPOS: Record<string, string> = {
  'tiny.en': 'onnx-community/whisper-tiny.en',
  'base.en': 'onnx-community/whisper-base.en',
}

let asr: any = null
let loadedModel = ''
let device = ''
let loading: Promise<void> | null = null

const post = (m: any) => (self as any).postMessage(m)

async function build(repo: string, dev: 'webgpu' | 'wasm') {
  // Same quantized files for both devices so the offline cache is identical.
  return pipeline('automatic-speech-recognition', repo, {
    device: dev,
    dtype: 'q8',
    progress_callback: (p: any) => post({ type: 'progress', ...p }),
  } as any)
}

async function load(model: string) {
  if (asr && loadedModel === model) return post({ type: 'ready', device })
  const repo = REPOS[model]
  if (!repo) throw new Error(`Unknown model ${model}`)
  if (asr) {
    try { await asr.dispose?.() } catch { /* ignore */ }
    asr = null
  }
  // WASM only: the q8 files are unreliable on WebGPU (empty transcripts), and the same
  // files serve both devices so the offline cache is identical.
  promptCache = null
  asr = await build(repo, 'wasm')
  device = 'wasm'
  loadedModel = model
  post({ type: 'ready', device })
}

// ---------- prompted transcription ----------
// Transformers.js declares Whisper's `prompt_ids` but does not apply it, so we build the decoder
// prefix ourselves, as OpenAI Whisper does: <|startofprev|> prompt <|startoftranscript|> <|notimestamps|>.
// The prompt reads like a previous transcript, which biases spelling (stipe, umbo, Latin names).
const SAMPLE_RATE = 16000
const WINDOW_S = 30
const OVERLAP_S = 2
const MAX_PROMPT_TOKENS = 160 // Whisper allows up to 223; shorter keeps tiny.en from echoing it
const MAX_NEW_TOKENS = 200 // prefix + output must stay under the 448-token decoder limit

let promptCache: { text: string; ids: number[] } | null = null

function promptPrefix(prompt: string): number[] | null {
  const tok = asr.tokenizer
  const cfg = asr.model.generation_config
  const prev = tok.convert_tokens_to_ids('<|startofprev|>')
  if (prev == null || cfg?.decoder_start_token_id == null) return null
  if (promptCache?.text !== prompt) {
    const ids: number[] = tok.encode(' ' + prompt.trim(), { add_special_tokens: false })
    promptCache = { text: prompt, ids: ids.slice(0, MAX_PROMPT_TOKENS) }
  }
  const prefix = [prev, ...promptCache.ids, cfg.decoder_start_token_id]
  if (cfg.no_timestamps_token_id != null) prefix.push(cfg.no_timestamps_token_id)
  return prefix
}

async function generateWindow(audio: Float32Array, prefix: number[]): Promise<string> {
  const { input_features } = await asr.processor(audio)
  const out = await asr.model.generate({ inputs: input_features, decoder_input_ids: prefix, max_new_tokens: MAX_NEW_TOKENS })
  const seq: number[] = (out.tolist()[0] as (number | bigint)[]).map(Number)
  // The output repeats the prefix; keep only what follows it.
  const gen = seq.slice(prefix.length)
  return gen.length ? String(asr.tokenizer.decode(gen, { skip_special_tokens: true })).trim() : ''
}

const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)

/** Small models sometimes copy the prompt instead of transcribing (often on silence). */
function echoesPrompt(text: string, prompt: string): boolean {
  const w = words(text)
  if (w.length < 5) return false
  return ` ${words(prompt).join(' ')} `.includes(` ${w.join(' ')} `)
}

async function transcribePrompted(audio: Float32Array, prompt: string): Promise<string | null> {
  const prefix = promptPrefix(prompt)
  if (!prefix) return null
  const win = WINDOW_S * SAMPLE_RATE
  const step = (WINDOW_S - OVERLAP_S) * SAMPLE_RATE
  let text = ''
  for (let start = 0; start < audio.length; start += step) {
    const part = audio.subarray(start, Math.min(audio.length, start + win))
    let t = await generateWindow(part, prefix)
    if (echoesPrompt(t, prompt)) t = await plain(part)
    text = joinTranscript(text, t)
    if (start + win >= audio.length) break
  }
  return text
}

async function plain(audio: Float32Array): Promise<string> {
  const out: any = await asr(audio, {
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: false,
    // English-only models: no language/task options.
  })
  return String(Array.isArray(out) ? out[0]?.text : out?.text ?? '').trim()
}

self.onmessage = async (e: MessageEvent) => {
  const m = e.data
  try {
    if (m.type === 'load') {
      loading = load(m.model)
      await loading
    } else if (m.type === 'transcribe') {
      if (loading) await loading.catch(() => {})
      if (!asr) throw new Error('Model not loaded')
      let text: string | null = null
      if (m.prompt) {
        try { text = await transcribePrompted(m.audio, m.prompt) } catch (err) {
          console.warn('Prompted transcription failed, using the plain pipeline', err)
        }
      }
      post({ type: 'result', id: m.id, text: text ?? (await plain(m.audio)) })
    } else if (m.type === 'dispose') {
      try { await asr?.dispose?.() } catch { /* ignore */ }
      asr = null
      loadedModel = ''
      promptCache = null
    }
  } catch (err: any) {
    post({ type: 'error', id: m.id, message: err?.message ?? String(err) })
  }
}
