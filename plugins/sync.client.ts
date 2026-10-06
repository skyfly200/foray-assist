// Triggers sync on reconnect, sign-in, new outbox work, and a modest interval.
// syncNow() itself refuses to overlap and requires online + signed in. Retry
// backoff/parking is persisted on outbox rows, so the interval/visibility ticks
// just re-run the drain; items not yet due (nextAttemptAt) are skipped.
export default defineNuxtPlugin(() => {
  const { online, signedIn, pending, syncNow } = useSync()
  const run = () => { void syncNow() }

  window.addEventListener('online', run)
  watch(signedIn, (v) => { if (v) run() })
  watch(online, (v) => { if (v) run() })

  let debounce: ReturnType<typeof setTimeout> | undefined
  watch(pending, (n, old) => {
    if (n > (old ?? 0)) {
      clearTimeout(debounce)
      debounce = setTimeout(run, 2000)
    }
  })

  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') run() })
  setInterval(run, 60_000)
  run()
})
