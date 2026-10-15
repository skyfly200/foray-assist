// On-device vision model (Gemma, Transformers.js v4, WebGPU) for photo tag suggestions.
// Protocol (main -> worker): {type:'load'} | {type:'ask', id, images: Blob[], prompt: string} | {type:'dispose'}
// Worker -> main: {type:'progress', ...} | {type:'ready'} | {type:'result', id, text} | {type:'error', id?, message}
import { AutoModelForImageTextToText, AutoProcessor, RawImage, env } from '@huggingface/transformers'
import { ortVariantSuffix } from '../utils/audio'
import { VISION_MODEL } from '../utils/visionModel'

env.allowLocalModels = false
env.useBrowserCache = true // Cache API 'transformers-cache', shared with Whisper

// Same self-hosted ONNX runtime as the Whisper worker (public/ort/, scripts/copy-ort.mjs).
{
  const suffix = ortVariantSuffix(self.navigator?.userAgent ?? '', !!(self.navigator as any)?.gpu)
  const base = new URL('/ort/', self.location.origin).href
  const wasm = (env.backends as any)?.onnx?.wasm
  if (wasm) wasm.wasmPaths = { mjs: `${base}ort-wasm-simd-threaded${suffix}.mjs`, wasm: `${base}ort-wasm-simd-threaded${suffix}.wasm` }
}

let processor: any = null
let model: any = null
let loading: Promise<void> | null = null

const post = (m: any) => (self as any).postMessage(m)

async function load() {
  if (model) return post({ type: 'ready' })
  const progress_callback = (p: any) => post({ type: 'progress', ...p })
  processor = await AutoProcessor.from_pretrained(VISION_MODEL.repo, { progress_callback } as any)
  model = await AutoModelForImageTextToText.from_pretrained(VISION_MODEL.repo, {
    device: 'webgpu', // a 4-bit multimodal model is far too slow on WASM
    dtype: VISION_MODEL.dtype,
    progress_callback,
  } as any)
  post({ type: 'ready' })
}

async function ask(images: Blob[], prompt: string): Promise<string> {
  const raws = await Promise.all(images.map((b) => RawImage.fromBlob(b)))
  const messages = [{ role: 'user', content: [...raws.map(() => ({ type: 'image' })), { type: 'text', text: prompt }] }]
  const text = processor.apply_chat_template(messages, { add_generation_prompt: true, enable_thinking: false })
  // Gemma 4's processor takes (text, images, audio, options).
  const inputs = await processor(text, raws, null, { add_special_tokens: false })
  const out = await model.generate({ ...inputs, max_new_tokens: 256, do_sample: false })
  const promptLen = inputs.input_ids.dims.at(-1)
  const [answer] = processor.batch_decode(out.slice(null, [promptLen, null]), { skip_special_tokens: true })
  return String(answer ?? '').trim()
}

self.onmessage = async (e: MessageEvent) => {
  const m = e.data
  try {
    if (m.type === 'load') {
      loading ??= load().finally(() => { loading = null })
      await loading
    } else if (m.type === 'ask') {
      if (loading) await loading.catch(() => {})
      if (!model) throw new Error('Photo model not loaded')
      post({ type: 'result', id: m.id, text: await ask(m.images, m.prompt) })
    } else if (m.type === 'dispose') {
      try { await model?.dispose?.() } catch { /* ignore */ }
      model = processor = null
    }
  } catch (err: any) {
    post({ type: 'error', id: m.id, message: err?.message ?? String(err) })
  }
}
