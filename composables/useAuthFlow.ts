// Sign-in routing. The emailed link lands on /auth/callback, which sends first-timers to
// /welcome and everyone else back to what they were doing (see utils/authFlow.ts).
// The page to return to is kept on this device, not in the link, so the Supabase
// redirect allow list only needs /auth/callback.
import { isNewUser, landingPath, safeReturnPath } from '../utils/authFlow'

const NEXT_KEY = 'fa-auth-next'
const NEXT_TTL_MS = 24 * 60 * 60 * 1000

export function authCallbackUrl() {
  return window.location.origin + '/auth/callback'
}

/** Remember where to return after the emailed link is opened. '' clears it. */
export function rememberReturn(path: string) {
  try {
    const p = safeReturnPath(path)
    if (p) localStorage.setItem(NEXT_KEY, JSON.stringify({ p, at: Date.now() }))
    else localStorage.removeItem(NEXT_KEY)
  } catch { /* storage blocked: fall back to the default landing */ }
}

export function storedReturn(): string {
  try {
    const v = JSON.parse(localStorage.getItem(NEXT_KEY) ?? 'null')
    if (v && Date.now() - v.at < NEXT_TTL_MS) return safeReturnPath(v.p)
  } catch { /* ignore */ }
  return ''
}

function clearReturn() {
  try { localStorage.removeItem(NEXT_KEY) } catch { /* ignore */ }
}

/** Email a sign-in link (and 6-digit code), remembering `returnTo` for when it's opened. */
export async function sendSignInEmail(sb: any, email: string, returnTo = '') {
  rememberReturn(returnTo)
  return sb.auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: true, emailRedirectTo: authCallbackUrl() },
  })
}

/** Where a returning user should land now. */
export async function landingNow(): Promise<string> {
  let forays: { id: string; startedAt: string; endedAt?: string }[] = []
  try { forays = await useDb().forays.toArray() } catch { /* IndexedDB unavailable */ }
  return landingPath(storedReturn(), forays)
}

/**
 * Route after a successful sign-in. New users see the welcome. Returning users go back
 * to the remembered page; with `stay`, a sign-in made in place (the 6-digit code)
 * leaves them where they are unless a page was remembered.
 */
export async function afterSignIn(sb: any, opts: { stay?: boolean } = {}) {
  let user: any = null
  try { user = (await sb.auth.getUser()).data?.user ?? null } catch { /* offline: treat as returning */ }
  if (isNewUser(user)) return navigateTo('/welcome', { replace: true })
  const next = storedReturn()
  if (opts.stay && !next) return
  const to = await landingNow()
  clearReturn()
  return navigateTo(to, { replace: true })
}

/** Called when the welcome is finished: flag the account so it isn't shown again, then go in. */
export async function finishWelcome(sb: any) {
  try { await sb?.auth.updateUser({ data: { welcomed: true } }) } catch { /* best-effort; the 1-day window still ends it */ }
  const to = await landingNow()
  clearReturn()
  return navigateTo(to, { replace: true })
}
