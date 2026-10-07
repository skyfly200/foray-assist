// Keeps the ID stock topped up: after sign-in, when the connection returns, when the stock
// changes, and now and then. Never blocks startup and never throws.
import { assignPendingIds } from '~/utils/specimenId'

export default defineNuxtPlugin(() => {
  const { ensureStock, refresh } = useIdStock()
  const sb = useSupabaseClient()
  let timer: ReturnType<typeof setTimeout> | null = null
  const soon = (ms = 800) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => ensureStock().catch(() => {}), ms)
  }
  refresh().catch(() => {})
  window.addEventListener('online', () => soon())
  window.addEventListener('fa-id-stock', () => {
    // Stock changed (sets claimed, or an ID taken): number any finds that were logged without an ID,
    // then refresh the counters and top up if low. assignPendingIds only notifies when it changed something.
    assignPendingIds()
      .catch(() => 0)
      .finally(() => refresh().catch(() => {}))
    soon(2000)
  })
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && soon())
  try {
    sb.auth.onAuthStateChange((_e: string, session: unknown) => session && soon(300))
  } catch {
    /* sync not configured: stay quiet */
  }
  setInterval(() => ensureStock().catch(() => {}), 5 * 60_000)
  soon(1500)
})
