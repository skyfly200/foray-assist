// Auto-download the voice model + WASM runtime once the app is installed (PWA), so
// offline voice notes work without the user hunting for the button.
// Guarded by Dexie settings key 'voiceAutoDownload' = { at, status: 'running'|'done'|'failed' }.
import { isModelCached, isOrtCached, useWhisper } from '~/composables/useWhisper'

const KEY = 'voiceAutoDownload'
const RUNNING_STALE_MS = 15 * 60 * 1000

export default defineNuxtPlugin(() => {
  const nav = navigator as any
  const standalone = () =>
    (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) || nav.standalone === true
  let inFlight = false

  async function read(): Promise<{ at: string; status: string } | undefined> {
    try {
      return (await useDb().settings.get(KEY))?.value as any
    } catch { return undefined }
  }
  async function write(status: 'running' | 'done' | 'failed') {
    try { await useDb().settings.put({ key: KEY, value: { at: new Date().toISOString(), status } }) } catch { /* ignore */ }
  }

  async function run(trigger: 'startup' | 'installed' | 'online') {
    if (inFlight || !navigator.onLine) return
    if (nav.connection?.saveData) return // respect Data Saver; the manual button stays available
    if (trigger !== 'installed' && !standalone()) return
    inFlight = true
    try {
      const prev = await read()
      if (prev?.status === 'done') return
      if (prev?.status === 'running' && Date.now() - Date.parse(prev.at) < RUNNING_STALE_MS) return
      // 'failed' is retried on startup and on the 'online' event; never in a loop.
      let wanted = 'tiny.en'
      try {
        const m = (await useDb().settings.get('whisperModel'))?.value
        if (m === 'tiny.en' || m === 'base.en') wanted = m
      } catch { /* default */ }
      if ((await isModelCached(wanted as any)) && (await isOrtCached())) {
        await write('done')
        return
      }
      await write('running')
      const w = useWhisper()
      await w.download()
      await write(w.status.value === 'ready' || w.isCached.value ? 'done' : 'failed')
    } catch {
      await write('failed')
    } finally {
      inFlight = false
    }
  }

  const later = (fn: () => void) => {
    const ric = (window as any).requestIdleCallback as undefined | ((f: () => void, o?: any) => void)
    setTimeout(() => (ric ? ric(fn, { timeout: 5000 }) : fn()), 4000)
  }

  window.addEventListener('appinstalled', () => later(() => run('installed')))
  window.addEventListener('online', () => later(() => run('online')))
  later(() => run('startup')) // never blocks startup
})
