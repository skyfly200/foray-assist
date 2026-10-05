// On-device Whisper (Transformers.js in a Web Worker). Module-level singleton so
// every component shares one worker and one model state.
//
// Never downloads by itself: call download() from a button press. transcribe()
// only loads a model that is already cached (offline-safe).
import { computed, ref } from 'vue'

export type WhisperModel = 'tiny.en' | 'base.en'
export type WhisperStatus =
  | 'unknown' // not yet checked
  | 'not-downloaded'
  | 'downloading' // fetching files, progress 0..100
  | 'loading' // cached, initialising the runtime
  | 'ready'
  | 'error'

export const WHISPER_MODELS: Record<WhisperModel, { repo: string; label: string; approxMB: number; note: string }> = {
  'tiny.en': { repo: 'onnx-community/whisper-tiny.en', label: 'Tiny (English)', approxMB: 40, note: 'Fast, small download (default)' },
  'base.en': { repo: 'onnx-community/whisper-base.en', label: 'Base (English)', approxMB: 80, note: 'High accuracy, slower' },
}

const CACHE_NAME = 'transformers-cache' // Transformers.js default env.cacheKey

const model = ref<WhisperModel>('tiny.en')
const status = ref<WhisperStatus>('unknown')
const progress = ref(0)
const error = ref('')
const device = ref('')
const cachedModels = ref<Record<WhisperModel, boolean>>({ 'tiny.en': false, 'base.en': false })

let worker: Worker | null = null
let initDone: Promise<void> | null = null
let loadWaiter: { resolve: () => void; reject: (e: Error) => void } | null = null
let nextId = 1
const pending = new Map<number, { resolve: (t: string) => void; reject: (e: Error) => void }>()
const fileBytes = new Map<string, { loaded: number; total: number }>()
let loadedModel: WhisperModel | '' = ''
let busy: Promise<unknown> = Promise.resolve()

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('../workers/whisper.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent) => {
    const m = e.data
    if (m.type === 'progress') onProgress(m)
    else if (m.type === 'ready') {
      device.value = m.device
      loadedModel = model.value
      status.value = 'ready'
      progress.value = 100
      cachedModels.value[model.value] = true
      loadWaiter?.resolve()
      loadWaiter = null
    } else if (m.type === 'result') {
      pending.get(m.id)?.resolve(m.text)
      pending.delete(m.id)
    } else if (m.type === 'error') {
      if (m.id != null && pending.has(m.id)) {
        pending.get(m.id)!.reject(new Error(m.message))
        pending.delete(m.id)
      } else {
        error.value = m.message
        status.value = 'error'
        loadWaiter?.reject(new Error(m.message))
        loadWaiter = null
      }
    }
  }
  worker.onerror = (e) => {
    error.value = e.message || 'Voice worker crashed'
    status.value = 'error'
    loadWaiter?.reject(new Error(error.value))
    loadWaiter = null
    for (const p of pending.values()) p.reject(new Error(error.value))
    pending.clear()
    worker = null
    loadedModel = ''
  }
  return worker
}

function onProgress(p: any) {
  if (p.status === 'progress' && p.file && typeof p.total === 'number') {
    fileBytes.set(p.file, { loaded: p.loaded ?? 0, total: p.total })
  } else if (p.status === 'done' && p.file) {
    const f = fileBytes.get(p.file)
    if (f) f.loaded = f.total
  }
  let loaded = 0
  let total = 0
  for (const f of fileBytes.values()) {
    loaded += f.loaded
    total += f.total
  }
  if (total > 0) progress.value = Math.min(99, Math.round((loaded / total) * 100))
}

async function cacheKeysFor(m: WhisperModel): Promise<{ cache: Cache; keys: Request[] } | null> {
  if (typeof caches === 'undefined') return null
  const cache = await caches.open(CACHE_NAME)
  const repo = WHISPER_MODELS[m].repo
  const keys = (await cache.keys()).filter((r) => r.url.includes(`/${repo}/`))
  return { cache, keys }
}

/** True when the model's ONNX weights and tokenizer are in the Cache API. */
export async function isModelCached(m: WhisperModel): Promise<boolean> {
  try {
    const r = await cacheKeysFor(m)
    if (!r) return false
    const onnx = r.keys.filter((k) => k.url.includes('.onnx')).length
    const tok = r.keys.some((k) => k.url.includes('tokenizer.json'))
    return onnx >= 2 && tok
  } catch {
    return false
  }
}

async function refreshCache() {
  for (const m of Object.keys(WHISPER_MODELS) as WhisperModel[]) cachedModels.value[m] = await isModelCached(m)
  if (status.value === 'unknown' || status.value === 'not-downloaded') {
    status.value = cachedModels.value[model.value] ? 'loading' : 'not-downloaded'
    if (status.value === 'loading') status.value = 'not-downloaded' // cached but not yet initialised; see isCached
  }
}

async function init() {
  if (!initDone) {
    initDone = (async () => {
      try {
        const row = await useDb().settings.get('whisperModel')
        if (row?.value === 'tiny.en' || row?.value === 'base.en') model.value = row.value
      } catch { /* ignore */ }
      await refreshCache()
    })()
  }
  return initDone
}

function startLoad(): Promise<void> {
  const w = getWorker()
  fileBytes.clear()
  error.value = ''
  progress.value = 0
  status.value = cachedModels.value[model.value] ? 'loading' : 'downloading'
  return new Promise<void>((resolve, reject) => {
    loadWaiter = { resolve, reject }
    w.postMessage({ type: 'load', model: model.value })
  })
}

let loadPromise: Promise<void> | null = null

/** Download (if needed) and initialise the current model. Call from a user action. */
async function download(): Promise<void> {
  await init()
  if (status.value === 'ready' && loadedModel === model.value) return
  if (loadPromise) return loadPromise
  loadPromise = startLoad().finally(() => { loadPromise = null })
  try { await loadPromise } catch { /* status/error already set */ }
}

/** Initialise a cached model without touching the network. Throws if not cached. */
async function ensureLoaded(): Promise<void> {
  await init()
  if (status.value === 'ready' && loadedModel === model.value) return
  if (!cachedModels.value[model.value]) throw new Error('Voice model not downloaded')
  await download()
  if (status.value !== 'ready') throw new Error(error.value || 'Voice model failed to load')
}

async function setModel(m: WhisperModel) {
  await init()
  if (m === model.value) return
  model.value = m
  try { await useDb().settings.put({ key: 'whisperModel', value: m }) } catch { /* ignore */ }
  loadedModel = ''
  worker?.postMessage({ type: 'dispose' })
  progress.value = 0
  error.value = ''
  await refreshCache()
  status.value = 'not-downloaded'
}

/** Delete the model's cached files (and free the worker). */
async function removeCache(m: WhisperModel = model.value) {
  const r = await cacheKeysFor(m)
  if (r) await Promise.all(r.keys.map((k) => r.cache.delete(k)))
  if (m === model.value) {
    worker?.postMessage({ type: 'dispose' })
    loadedModel = ''
    status.value = 'not-downloaded'
    progress.value = 0
  }
  await refreshCache()
  if (m === model.value) status.value = 'not-downloaded'
}

/** Transcribe 16 kHz mono Float32 audio. Requires a cached model; serialised in order. */
function transcribe(audio: Float32Array): Promise<string> {
  const run = async () => {
    await ensureLoaded()
    const id = nextId++
    return new Promise<string>((resolve, reject) => {
      pending.set(id, { resolve, reject })
      getWorker().postMessage({ type: 'transcribe', id, audio }, [audio.buffer])
    })
  }
  const p = busy.then(run, run)
  busy = p.catch(() => {})
  return p
}

export function useWhisper() {
  init()
  const isCached = computed(() => cachedModels.value[model.value])
  const isReady = computed(() => status.value === 'ready' && loadedModel === model.value)
  /** Model name stored on VoiceNote.model, e.g. 'whisper-tiny.en'. */
  const modelTag = computed(() => `whisper-${model.value}`)
  return {
    model,
    modelTag,
    status,
    progress,
    error,
    device,
    cachedModels,
    isCached,
    isReady,
    models: WHISPER_MODELS,
    refreshCache,
    download,
    setModel,
    removeCache,
    transcribe,
  }
}
