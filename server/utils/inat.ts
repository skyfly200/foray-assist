// iNaturalist API wrapper (v1). EVERYTHING that knows about iNat's URLs, auth
// scheme or payload shape lives in this file so a move to v2 is contained.
// Plain fetch only (no inaturalistjs). Pure helpers at the top have no imports
// so tests/inat.test.mjs can run them under node --experimental-strip-types.
// Server helpers below rely on Nitro auto-imports (auth.ts, h3) and are only
// called from routes.

import { displayId } from '../../utils/idCode.ts'

export const INAT_SITE = 'https://www.inaturalist.org'
export const INAT_API = 'https://api.inaturalist.org/v1'

export type Geoprivacy = 'open' | 'obscured' | 'private'
export interface FindInput {
  specimenId?: string
  timestamp: string
  latitude?: number
  longitude?: number
  geoprivacy?: string
  positionalAccuracy?: number
  fieldNotes?: {
    speciesGuess?: string; substrate?: string; hostTree?: string; odor?: string
    capTexture?: string; staining?: string; notes?: string
  }
}

const GEO = ['open', 'obscured', 'private']
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/** Human-readable description composed from field notes (+ our specimen id). */
export function composeDescription(f: FindInput): string {
  const n = f.fieldNotes ?? {}
  const lines: string[] = []
  if (n.notes?.trim()) lines.push(n.notes.trim())
  const facts: [string, string | undefined][] = [
    ['Substrate', n.substrate], ['Host tree', n.hostTree], ['Odor', n.odor],
    ['Cap texture', n.capTexture], ['Staining', n.staining],
  ]
  const fl = facts.filter(([, v]) => v?.trim()).map(([k, v]) => `${k}: ${v!.trim()}`)
  if (fl.length) lines.push(fl.join('\n'))
  if (f.specimenId) lines.push(`Specimen ID: ${displayId(f.specimenId)}`)
  return lines.join('\n\n')
}

/** Map a find to the body of POST /v1/observations. Omits undefined fields. */
export function buildObservationPayload(f: FindInput) {
  if (!f.timestamp || Number.isNaN(Date.parse(f.timestamp))) throw new Error('Find has no valid timestamp')
  const obs: Record<string, unknown> = {
    observed_on_string: f.timestamp,
    geoprivacy: GEO.includes(f.geoprivacy ?? '') ? f.geoprivacy : 'obscured',
  }
  const lat = num(f.latitude), lng = num(f.longitude)
  if (lat !== undefined && lng !== undefined && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    obs.latitude = lat
    obs.longitude = lng
    const acc = num(f.positionalAccuracy)
    if (acc !== undefined && acc >= 0) obs.positional_accuracy = Math.round(acc)
  }
  const guess = f.fieldNotes?.speciesGuess?.trim()
  if (guess) obs.species_guess = guess
  const desc = composeDescription(f)
  if (desc) obs.description = desc
  return { observation: obs }
}

/** Pull the observation id out of a v1 create response (array or {results}). */
export function parseCreatedId(body: any): number | undefined {
  const first = Array.isArray(body) ? body[0] : body?.results?.[0] ?? body
  const id = first?.id
  return typeof id === 'number' ? id : undefined
}

export function backoffMs(attempt: number, retryAfter?: string | null): number {
  const ra = Number(retryAfter)
  if (Number.isFinite(ra) && ra > 0) return Math.min(ra * 1000, 8000)
  return Math.min(500 * 2 ** attempt, 4000)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** fetch with retry on 429/5xx (kept short: serverless time limits). */
export async function inatFetch(url: string, init: RequestInit & { retries?: number } = {}): Promise<Response> {
  const retries = init.retries ?? 3
  let res: Response | undefined
  for (let a = 0; a <= retries; a++) {
    try {
      res = await fetch(url, init)
    } catch (e) {
      if (a === retries) throw e
      await sleep(backoffMs(a)); continue
    }
    if (res.status !== 429 && res.status < 500) return res
    if (a === retries) return res
    await sleep(backoffMs(a, res.headers.get('retry-after')))
  }
  return res!
}

// ---- OAuth (authorization-code flow) -------------------------------------

export function authorizeUrl(appId: string, redirectUri: string, state: string): string {
  const q = new URLSearchParams({ client_id: appId, redirect_uri: redirectUri, response_type: 'code', state })
  return `${INAT_SITE}/oauth/authorize?${q}`
}

export async function exchangeCode(appId: string, secret: string, redirectUri: string, code: string) {
  const res = await inatFetch(`${INAT_SITE}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: appId, client_secret: secret, code, redirect_uri: redirectUri, grant_type: 'authorization_code',
    }),
    retries: 1,
  })
  if (!res.ok) throw new Error(`iNaturalist token exchange failed (${res.status})`)
  return (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number }
}

/** OAuth access token -> short-lived (24h) API JWT. */
export async function fetchApiJwt(accessToken: string): Promise<string> {
  const res = await inatFetch(`${INAT_SITE}/users/api_token`, { headers: { authorization: `Bearer ${accessToken}` }, retries: 1 })
  if (!res.ok) throw new Error(`iNaturalist api_token failed (${res.status})`)
  const j: any = await res.json()
  if (!j?.api_token) throw new Error('iNaturalist returned no api_token')
  return j.api_token
}

export async function fetchLogin(jwt: string): Promise<string | undefined> {
  const res = await inatFetch(`${INAT_API}/users/me`, { headers: { authorization: jwt }, retries: 1 })
  if (!res.ok) return undefined
  return ((await res.json()) as any)?.results?.[0]?.login
}

export async function createObservation(jwt: string, payload: unknown): Promise<number> {
  const res = await inatFetch(`${INAT_API}/observations`, {
    method: 'POST',
    headers: { authorization: jwt, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new InatError(res.status, `iNaturalist rejected the observation (${res.status})`)
  const id = parseCreatedId(await res.json())
  if (!id) throw new InatError(502, 'iNaturalist returned no observation id')
  return id
}

export async function uploadPhoto(jwt: string, observationId: number, file: Blob, filename: string): Promise<number | undefined> {
  const fd = new FormData()
  fd.append('observation_photo[observation_id]', String(observationId))
  fd.append('file', file, filename)
  const res = await inatFetch(`${INAT_API}/observation_photos`, { method: 'POST', headers: { authorization: jwt }, body: fd })
  if (!res.ok) throw new InatError(res.status, `iNaturalist rejected the photo (${res.status})`)
  const j: any = await res.json().catch(() => null)
  return Array.isArray(j) ? j[0]?.id : j?.id
}

export class InatError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

// ---- State: HMAC-signed so the callback can bind it to a user without a session.

export async function signState(secret: string, userId: string, ttlMs = 10 * 60_000): Promise<string> {
  const nonce = crypto.randomUUID()
  const exp = Date.now() + ttlMs
  const body = `${userId}.${nonce}.${exp}`
  return `${btoa(body).replace(/=+$/, '')}.${await hmac(secret, body)}`
}

export async function verifyState(secret: string, state: string): Promise<string | null> {
  const [b64, sig] = state.split('.')
  if (!b64 || !sig) return null
  let body = ''
  try { body = atob(b64) } catch { return null }
  const expected = await hmac(secret, body)
  if (expected.length !== sig.length) return null
  let diff = 0
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i)
  if (diff) return null
  const [userId, , exp] = body.split('.')
  if (!userId || Number(exp) < Date.now()) return null
  return userId
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)))
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('')
}

// ---- Session (uses auth.ts helpers via Nitro auto-import) ------------------

export function inatEnv() {
  const appId = process.env.INAT_APP_ID, secret = process.env.INAT_APP_SECRET
  if (!appId || !secret) throw createError({ statusCode: 500, statusMessage: 'Server is missing INAT_APP_ID / INAT_APP_SECRET' })
  return { appId, secret }
}

/** Valid API JWT for the user, refreshing (and caching in tokens.extra) when stale. */
export async function getInatJwt(userId: string): Promise<string> {
  const t = await getTokens(userId, 'inat')
  if (!t?.access_token) throw createError({ statusCode: 409, statusMessage: 'iNaturalist is not connected' })
  const extra = t.extra ?? {}
  if (extra.jwt && Number(extra.jwt_exp) > Date.now() + 60_000) return extra.jwt
  try {
    const jwt = await fetchApiJwt(t.access_token)
    await saveTokens(userId, 'inat', { extra: { ...extra, jwt, jwt_exp: Date.now() + 23 * 3600_000 } })
    return jwt
  } catch (e: any) {
    throw createError({ statusCode: 409, statusMessage: 'iNaturalist connection expired; reconnect in Settings' })
  }
}

/** Map an iNat failure to a Nitro error with a safe message (never includes tokens). */
export function toHttpError(e: any) {
  if (e?.statusCode) return e
  const st = e instanceof InatError ? (e.status === 401 || e.status === 403 ? 409 : e.status === 422 ? 422 : 502) : 502
  return createError({ statusCode: st, statusMessage: e?.message ?? 'iNaturalist request failed' })
}
