// Triggers sync on reconnect, sign-in, new outbox work, and a modest interval.
// syncNow() itself refuses to overlap and requires online + signed in.
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

  setInterval(run, 60_000)
  run()
})
