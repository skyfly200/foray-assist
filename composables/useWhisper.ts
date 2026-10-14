// On-device Whisper (Transformers.js in a Web Worker). Module-level singleton so
// every component shares one worker and one model state.
//
// Never downloads by itself: call download() from a button press. transcribe()
// only loads a model that is already cached (offline-safe).
import { computed, ref } from 'vue'
import { normalizePeak, ortVariantSuffix } from '~/utils/audio'
import { friendlyError, stallWatch, transcribeTimeoutMs, withTimeout } from '~/utils/taskGuard'

// No progress for this long means the download or start-up is stuck: stop it and offer Retry.
const DOWNLOAD_STALL_MS = 60_000
const LOAD_STALL_MS = 120_000 // compiling the runtime on a slow phone sends no progress

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
let watch: ReturnType<typeof stallWatch> | null = null
const HF = 'Hugging Face (where the voice model is downloaded from)'

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('../workers/whisper.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent) => {
    const m = e.data
    watch?.poke()
    if (m.type === 'progress') onProgress(m)
    else if (m.type === 'ready') {
      watch?.stop()
      watch = null
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
        watch?.stop()
        watch = null
        error.value = friendlyError(new Error(m.message), HF)
        status.value = 'error'
        loadWaiter?.reject(new Error(m.message))
        loadWaiter = null
      }
    }
  }
  worker.onerror = (e) => {
    terminate(e.message || 'Voice worker crashed', 'error')
  }
  return worker
}

/**
 * Kill the worker (the only way to stop a running download or WASM transcription) and fail
 * everything waiting on it. The next download()/transcribe() starts a fresh worker.
 * `as`: 'error' shows `reason`; 'idle' goes back to cached / not-downloaded (a Stop press).
 */
function terminate(reason: string, as: 'error' | 'idle') {
  watch?.stop()
  watch = null
  try { worker?.terminate() } catch { /* ignore */ }
  worker = null
  loadedModel = ''
  loadPromise = null
  const err = new Error(reason)
  loadWaiter?.reject(err)
  loadWaiter = null
  for (const p of pending.values()) p.reject(err)
  pending.clear()
  progress.value = 0
  if (as === 'error') {
    error.value = reason
    status.value = 'error'
  } else {
    error.value = ''
    status.value = cachedModels.value[model.value] ? 'cached' : 'not-downloaded'
  }
}

/** Stop a download, model start-up, or transcription in progress. Recordings stay saved. */
function cancel() {
  terminate('Stopped', 'idle')
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
  const downloading = !cachedModels.value[model.value]
  status.value = downloading ? 'downloading' : 'loading'
  watch?.stop()
  const limit = downloading ? DOWNLOAD_STALL_MS : LOAD_STALL_MS
  watch = stallWatch(limit, () => {
    terminate(
      downloading
        ? `The voice model download stopped making progress (nothing received for ${limit / 1000} seconds). Check your connection, then press Retry.`
        : 'The voice model took too long to start. Press Retry, or close other apps to free memory.',
      'error',
    )
  })
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
    try { await withTimeout(fetchOrt(), DOWNLOAD_STALL_MS * 3, 'Downloading the speech runtime timed out'); ortFetched = true } catch (e: any) {
      error.value = friendlyError(e, 'The app server')
      status.value = 'error'
      return
    }
  }
  if (status.value === 'ready' && loadedModel === model.value) return
  if (loadPromise) return loadPromise
  const p = startLoad().finally(() => { if (loadPromise === p) loadPromise = null })
  loadPromise = p
  try { await p } catch { /* status/error already set */ }
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

/** Delete the model's cached files (and free the worker). */
async function removeCache(m: WhisperModel = model.value) {
  const r = await cacheKeysFor(m)
  if (r) await Promise.all(r.keys.map((k) => r.cache.delete(k)))
  if (m === model.value) {
    worker?.postMessage({ type: 'dispose' })
    loadedModel = ''
    status.value = 'unknown'
    progress.value = 0
  }
  await refreshCache()
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
    const ms = transcribeTimeoutMs(audio.length)
    const job = new Promise<string>((resolve, reject) => {
      pending.set(id, { resolve, reject })
      getWorker().postMessage({ type: 'transcribe', id, audio, prompt }, [audio.buffer])
    })
    // A stuck worker would otherwise hold up every later transcription (they run in order).
    return withTimeout(job, ms, `Transcription took longer than ${Math.round(ms / 1000)} seconds and was stopped`, () => {
      if (pending.has(id)) terminate('Transcription was stopped because it took too long', 'idle')
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
    cancel,
  }
}
