// On-device Whisper (Transformers.js in a Web Worker). Module-level singleton so
// every component shares one worker and one model state.
//
// Never downloads by itself: call download() from a button press. transcribe()
// only loads a model that is already cached (offline-safe).
import { computed, ref } from 'vue'
import { normalizePeak, ortVariantSuffix } from '~/utils/audio'

export type WhisperModel = 'tiny.en' | 'base.en'
export type WhisperStatus =
  | 'unknown' // not yet checked
  | 'not-downloaded'
  | 'cached' // files are on the device; runtime loads lazily on first transcribe (no network)
  | 'downloading' // fetching files, progress 0..100
  | 'loading' // cached, initialising the runtime
  | 'ready'
  | 'error'

export const WHISPER_MODELS: Record<WhisperModel, { repo: string; label: string; approxMB: number; note: string }> = {
  'tiny.en': { repo: 'onnx-community/whisper-tiny.en', label: 'Tiny (English)', approxMB: 70, note: 'Fast, smaller download (default). Size includes the ~30 MB speech engine' },
  'base.en': { repo: 'onnx-community/whisper-base.en', label: 'Base (English)', approxMB: 110, note: 'High accuracy, slower. Size includes the ~30 MB speech engine' },
}

const CACHE_NAME = 'transformers-cache' // Transformers.js default env.cacheKey
const ORT_SW_CACHE = 'ort-runtime' // service worker runtime cache for /ort/ (nuxt.config.ts)

const model = ref<WhisperModel>('tiny.en')
const status = ref<WhisperStatus>('unknown')
const progress = ref(0)
const error = ref('')
const device = ref('')
const cachedModels = ref<Record<WhisperModel, boolean>>({ 'tiny.en': false, 'base.en': false })
/** Bytes each model and the shared speech runtime take on this device (0 when absent). */
const storage = ref<{ models: Record<WhisperModel, number>; runtime: number }>({ models: { 'tiny.en': 0, 'base.en': 0 }, runtime: 0 })

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
  if (status.value === 'unknown' || status.value === 'not-downloaded' || status.value === 'cached') {
    status.value = cachedModels.value[model.value] ? 'cached' : 'not-downloaded'
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
let ortFetched = false

export async function isOrtCached(): Promise<boolean> {
  try {
    const suffix = ortVariantSuffix(navigator.userAgent, !!(navigator as any).gpu)
    return !!(await caches.match(`/ort/ort-wasm-simd-threaded${suffix}.wasm`))
  } catch { return false }
}

/** Fetch the self-hosted ONNX WASM runtime so it lands in the HTTP/SW runtime cache ('/ort/'). */
async function fetchOrt(): Promise<void> {
  const suffix = ortVariantSuffix(navigator.userAgent, !!(navigator as any).gpu)
  for (const ext of ['mjs', 'wasm']) {
    const r = await fetch(`/ort/ort-wasm-simd-threaded${suffix}.${ext}`, { cache: 'reload' })
    if (!r.ok) throw new Error(`Could not download the speech runtime (${r.status})`)
    await r.arrayBuffer() // consume fully so the cache entry completes
  }
}

/** Download (if needed) and initialise the current model + WASM runtime. Call from a user action (or the install auto-download). */
async function download(): Promise<void> {
  await init()
  if (status.value !== 'ready' && !loadPromise && !ortFetched && navigator.onLine && !(await isOrtCached())) {
    try { await fetchOrt(); ortFetched = true } catch (e: any) {
      error.value = e?.message ?? String(e)
      status.value = 'error'
      return
    }
  }
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
  status.value = 'unknown'
  await refreshCache()
}

async function entryBytes(cache: Cache, req: Request): Promise<number> {
  try {
    const res = await cache.match(req)
    if (!res) return 0
    const len = Number(res.headers.get('content-length'))
    if (len > 0) return len
    return (await res.blob()).size
  } catch { return 0 }
}

async function sumBytes(cache: Cache, keys: readonly Request[]): Promise<number> {
  let n = 0
  for (const k of keys) n += await entryBytes(cache, k)
  return n
}

const isOrtKey = (r: Request) => new URL(r.url).pathname.startsWith('/ort/')

/** Recount how much space each model and the speech runtime use. */
async function refreshStorage() {
  if (typeof caches === 'undefined') return
  try {
    const models = { 'tiny.en': 0, 'base.en': 0 } as Record<WhisperModel, number>
    for (const m of Object.keys(WHISPER_MODELS) as WhisperModel[]) {
      const r = await cacheKeysFor(m)
      if (r) models[m] = await sumBytes(r.cache, r.keys)
    }
    // The runtime can sit in both caches (transformers.js wasm cache and the SW cache); both copies take space.
    let runtime = 0
    for (const name of [CACHE_NAME, ORT_SW_CACHE]) {
      if (!(await caches.has(name))) continue
      const c = await caches.open(name)
      runtime += await sumBytes(c, (await c.keys()).filter(isOrtKey))
    }
    storage.value = { models, runtime }
  } catch { /* leave previous numbers */ }
}

function disposeWorker() {
  worker?.postMessage({ type: 'dispose' })
  loadedModel = ''
  status.value = 'unknown'
  progress.value = 0
}

/** Delete the shared speech runtime (WASM) from every cache it lands in. */
async function removeRuntime() {
  if (typeof caches === 'undefined') return
  for (const name of [CACHE_NAME, ORT_SW_CACHE]) {
    if (!(await caches.has(name))) continue
    const c = await caches.open(name)
    await Promise.all((await c.keys()).filter(isOrtKey).map((k) => c.delete(k)))
  }
  ortFetched = false
}

/**
 * Delete the model's cached files (and free the worker) to free up space.
 * When no other model is left, the speech runtime goes too, since nothing uses it.
 */
async function removeCache(m: WhisperModel = model.value) {
  const r = await cacheKeysFor(m)
  if (r) await Promise.all(r.keys.map((k) => r.cache.delete(k)))
  if (m === model.value || loadedModel === m) disposeWorker()
  await refreshCache()
  if (!Object.values(cachedModels.value).some(Boolean)) {
    await removeRuntime()
    disposeWorker()
    await refreshCache()
  }
  await refreshStorage()
}

/**
 * Transcribe 16 kHz mono Float32 audio. Requires a cached model; serialised in order. The array's buffer is transferred (detached) to the worker.
 * `prompt` is text Whisper treats as the previous transcript, to bias vocabulary (see utils/mycoVocab.ts).
 */
function transcribe(input: Float32Array, prompt?: string): Promise<string> {
  const audio = normalizePeak(input)
  const run = async () => {
    await ensureLoaded()
    const id = nextId++
    return new Promise<string>((resolve, reject) => {
      pending.set(id, { resolve, reject })
      getWorker().postMessage({ type: 'transcribe', id, audio, prompt }, [audio.buffer])
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
    storage,
    refreshStorage,
    download,
    setModel,
    removeCache,
    transcribe,
  }
}
