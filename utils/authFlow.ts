// Where to send someone after they sign in. Pure helpers, used by composables/useAuthFlow.ts.
//
// - First sign-in: /welcome (a short greeting), which then carries on to `next`.
// - Returning user: back to the page they asked from, or their open foray, or home.

/** Pages that are never worth returning to after signing in. */
const NO_RETURN = [/^\/auth(\/|$)/, /^\/welcome(\/|$)/, /^\/settings(\/|$)/]

/**
 * A same-app path that is safe to navigate to, or '' if not. Rejects absolute URLs,
 * protocol-relative `//host` paths and backslash tricks, so a crafted `next` can't
 * bounce someone to another site.
 */
export function safeReturnPath(p: unknown): string {
  if (typeof p !== 'string') return ''
  const s = p.trim()
  if (!s.startsWith('/') || s.startsWith('//') || s.includes('\\') || /[\u0000-\u001f]/.test(s)) return ''
  const path = s.split(/[?#]/)[0]
  if (path === '/' || NO_RETURN.some((re) => re.test(path))) return ''
  return s
}

export interface AuthUserLike {
  created_at?: string
  last_sign_in_at?: string | null
  user_metadata?: Record<string, unknown> | null
}

/** A day: long enough for a magic link opened the next morning, short enough that older accounts don't count. */
const NEW_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * True for someone who hasn't seen the welcome yet and whose account is brand new
 * (made within a day of this sign-in). Accounts from before the welcome existed
 * have no flag but are older, so they go straight in.
 */
export function isNewUser(user: AuthUserLike | null | undefined, now = Date.now()): boolean {
  if (!user) return false
  if (user.user_metadata?.welcomed) return false
  const created = Date.parse(user.created_at ?? '')
  if (Number.isNaN(created)) return false
  const signedIn = Date.parse(user.last_sign_in_at ?? '') || now
  return signedIn - created < NEW_WINDOW_MS
}

export interface ForayLike { id: string; startedAt: string; endedAt?: string }

/** The foray still in progress (most recently started, not ended), if any. */
export function openForay<T extends ForayLike>(forays: T[]): T | undefined {
  return forays
    .filter((f) => !f.endedAt)
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0))[0]
}

/** Where a returning user goes: the page they came from, else their open foray, else home. */
export function landingPath(next: unknown, forays: ForayLike[]): string {
  const back = safeReturnPath(next)
  if (back) return back
  const open = openForay(forays)
  return open ? `/forays/${open.id}` : '/'
}
