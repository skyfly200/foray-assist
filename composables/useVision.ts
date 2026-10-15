// On-device vision model for photo tag suggestions (workers/vision.worker.ts). Module-level singleton.
// Desktop only in practice: it needs WebGPU and a multi-GB download, so it never downloads by itself.
import { computed, ref } from 'vue'
import { VISION_MODEL } from '~/utils/visionModel'

export type VisionStatus = 'unknown' | 'not-downloaded' | 'cached' | 'downloading' | 'loading' | 'ready' | 'error'

const CACHE_NAME = 'transformers-cache'

const status = ref<VisionStatus>('unknown')
const progress = ref(0)
const error = ref('')
const bytes = ref(0)

let worker: Worker | null = null
let loadWaiter: { resolve: () => void; reject: (e: Error) => void } | null = null
let loadPromise: Promise<void> | null = null
let nextId = 1
const pending = new Map<number, { resolve: (t: string) => void; reject: (e: Error) => void }>()
const fileBytes = new Map<string, { loaded: number; total: number }>()
let busy: Promise<unknown> = Promise.resolve()

/** WebGPU is required; without it the model would take minutes per answer. */
export const visionSupported = () => typeof navigator !== 'undefined' && !!(navigator as any).gpu

function fail(message: string) {
  error.value = message
  status.value = 'error'
  loadWaiter?.reject(new Error(message))
  loadWaiter = null
}

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('../workers/vision.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent) => {
    const m = e.data
    if (m.type === 'progress') onProgress(m)
    else if (m.type === 'ready') {
      status.value = 'ready'
      progress.value = 100
      loadWaiter?.resolve()
      loadWaiter = null
    } else if (m.type === 'result') {
      pending.get(m.id)?.resolve(m.text)
      pending.delete(m.id)
    } else if (m.type === 'error') {
      if (m.id != null && pending.has(m.id)) {
        pending.get(m.id)!.reject(new Error(m.message))
        pending.delete(m.id)
      } else fail(m.message)
    }
  }
  worker.onerror = (e) => {
    fail(e.message || 'Photo model crashed (the computer may be out of graphics memory)')
    for (const p of pending.values()) p.reject(new Error(error.value))
    pending.clear()
    worker = null
  }
  return worker
}

function onProgress(p: any) {
  if (p.status === 'progress' && p.file && typeof p.total === 'number') fileBytes.set(p.file, { loaded: p.loaded ?? 0, total: p.total })
  else if (p.status === 'done' && p.file) {
    const f = fileBytes.get(p.file)
    if (f) f.loaded = f.total
  }
  let loaded = 0
  let total = 0
  for (const f of fileBytes.values()) { loaded += f.loaded; total += f.total }
  if (total > 0) progress.value = Math.min(99, Math.round((loaded / total) * 100))
}

async function modelKeys(): Promise<{ cache: Cache; keys: Request[] } | null> {
  if (typeof caches === 'undefined') return null
  const cache = await caches.open(CACHE_NAME)
  return { cache, keys: (await cache.keys()).filter((r) => r.url.includes(`/${VISION_MODEL.repo}/`)) }
}

/** Check whether the model files are on this device, and how much space they take. */
async function refresh() {
  try {
    const r = await modelKeys()
    const cached = !!r && r.keys.some((k) => k.url.includes('.onnx')) && r.keys.some((k) => k.url.includes('tokenizer.json'))
    let n = 0
    if (r) for (const k of r.keys) {
      const res = await r.cache.match(k)
      n += Number(res?.headers.get('content-length')) || 0
    }
    bytes.value = n
    if (status.value === 'unknown' || status.value === 'not-downloaded' || status.value === 'cached') status.value = cached ? 'cached' : 'not-downloaded'
  } catch { /* leave as is */ }
}

/** Download (if needed) and start the model. Call from a button press only. */
async function load(): Promise<void> {
  if (status.value === 'ready') return
  if (loadPromise) return loadPromise
  if (!visionSupported()) return fail('This browser has no WebGPU. Try Chrome or Edge on a computer.')
  if (status.value === 'error') status.value = 'unknown'
  await refresh()
  fileBytes.clear()
  error.value = ''
  progress.value = 0
  status.value = status.value === 'cached' ? 'loading' : 'downloading'
  loadPromise = new Promise<void>((resolve, reject) => {
    loadWaiter = { resolve, reject }
    getWorker().postMessage({ type: 'load' })
  }).finally(() => { loadPromise = null; void refresh() })
  try { await loadPromise } catch { /* status/error already set */ }
}

/** Ask the model about some photos. Requires load() first; requests run one at a time. */
function ask(images: Blob[], prompt: string): Promise<string> {
  const run = async () => {
    if (status.value !== 'ready') await load()
    if (status.value !== 'ready') throw new Error(error.value || 'Photo model is not ready')
    const id = nextId++
    return new Promise<string>((resolve, reject) => {
      pending.set(id, { resolve, reject })
      getWorker().postMessage({ type: 'ask', id, images, prompt })
    })
  }
  const p = busy.then(run, run)
  busy = p.catch(() => {})
  return p
}

/** Delete the model files and free the graphics memory. The shared ONNX runtime stays for Whisper. */
async function remove() {
  worker?.postMessage({ type: 'dispose' })
  const r = await modelKeys()
  if (r) await Promise.all(r.keys.map((k) => r.cache.delete(k)))
  status.value = 'unknown'
  progress.value = 0
  error.value = ''
  await refresh()
}

export function useVision() {
  void refresh()
  return {
    model: VISION_MODEL,
    status,
    progress,
    error,
    bytes,
    supported: computed(visionSupported),
    isReady: computed(() => status.value === 'ready'),
    load,
    ask,
    remove,
    refresh,
  }
}
