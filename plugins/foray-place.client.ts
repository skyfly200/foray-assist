// Fills in places for date-only foray names: at startup, when the connection returns, when the app
// comes back to the front, and now and then (finds pick up GPS after the foray starts). Never throws.
import { fillForayPlaces } from '~/composables/useForayPlace'

export default defineNuxtPlugin(() => {
  const run = () => { void fillForayPlaces().catch(() => {}) }
  window.addEventListener('online', run)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && run())
  setInterval(run, 2 * 60_000)
  setTimeout(run, 3000)
})
