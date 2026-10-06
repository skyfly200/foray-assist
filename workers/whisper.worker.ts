// Whisper speech-to-text in a Web Worker (Transformers.js v4).
// Protocol (main -> worker): {type:'load', model} | {type:'transcribe', id, audio: Float32Array(16k mono)} | {type:'dispose'}
// Worker -> main: {type:'progress', ...} | {type:'ready', device} | {type:'result', id, text} | {type:'error', id?, message}
import { pipeline, env } from '@huggingface/transformers'
import { ortVariantSuffix } from '../utils/audio'

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
  asr = await build(repo, 'wasm')
  device = 'wasm'
  loadedModel = model
  post({ type: 'ready', device })
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
      const out: any = await asr(m.audio, {
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: false,
        // English-only models: no language/task options.
      })
      post({ type: 'result', id: m.id, text: String(Array.isArray(out) ? out[0]?.text : out?.text ?? '').trim() })
    } else if (m.type === 'dispose') {
      try { await asr?.dispose?.() } catch { /* ignore */ }
      asr = null
      loadedModel = ''
    }
  } catch (err: any) {
    post({ type: 'error', id: m.id, message: err?.message ?? String(err) })
  }
}
