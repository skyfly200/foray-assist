// Google Photos integration helpers (server only).
//
// README-style note: Google removed broad Library API read access for apps
// created after 2025-03-31 (the photoslibrary.readonly scope and the
// mediaItems:search time-window/location query no longer work for new
// projects). The supported route is the **Picker API**
// (https://photospicker.googleapis.com/v1, scope
// https://www.googleapis.com/auth/photospicker.mediaitems.readonly):
//   1. POST /v1/sessions            -> { id, pickerUri, pollingConfig, mediaItemsSet }
//   2. user opens pickerUri (+ "/autoclose") and chooses photos in Google's UI
//   3. GET  /v1/sessions/{id}       -> poll until mediaItemsSet === true
//   4. GET  /v1/mediaItems?sessionId=... -> picked items (id, createTime, mediaFile.baseUrl ...)
//   5. GET  baseUrl[=params] with `Authorization: Bearer <token>` -> bytes
// The Picker API does not return GPS; location can only come from EXIF in the
// original bytes. Tokens never leave the server.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { createError, type H3Event } from 'h3'
import { appOrigin, deleteTokens, getTokens, saveTokens } from './auth'

export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly'
export const PICKER_BASE = 'https://photospicker.googleapis.com/v1'
export const STATE_COOKIE = 'g_oauth_nonce'

function env(name: string): string {
  const v = process.env[name]
  if (!v) throw createError({ statusCode: 500, statusMessage: `Server is missing ${name}` })
  return v
}

export const redirectUri = (event: H3Event) => `${appOrigin(event)}/api/google/callback`

// ---- signed OAuth state (bound to user id + a nonce also kept in a cookie) ----
const b64 = (s: string) => Buffer.from(s).toString('base64url')
const sign = (payload: string) => createHmac('sha256', env('GOOGLE_CLIENT_SECRET')).update(payload).digest('base64url')

export function makeState(userId: string): { state: string; nonce: string } {
  const nonce = randomBytes(16).toString('base64url')
  const payload = b64(JSON.stringify({ u: userId, n: nonce, e: Date.now() + 10 * 60_000 }))
  return { state: `${payload}.${sign(payload)}`, nonce }
}

export function googleVerifyState(state: string, nonceCookie: string | undefined): string {
  const bad = () => createError({ statusCode: 400, statusMessage: 'Invalid or expired OAuth state' })
  const [payload, sig] = (state || '').split('.')
  if (!payload || !sig) throw bad()
  const expected = sign(payload)
  const a = Buffer.from(sig), b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw bad()
  let data: { u: string; n: string; e: number }
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString()) } catch { throw bad() }
  if (!data.u || data.e < Date.now() || !nonceCookie || nonceCookie !== data.n) throw bad()
  return data.u
}

export function authUrl(event: H3Event, state: string): string {
  const q = new URLSearchParams({
    client_id: env('GOOGLE_CLIENT_ID'),
    redirect_uri: redirectUri(event),
    response_type: 'code',
    scope: GOOGLE_SCOPE,
    access_type: 'offline', // refresh token
    prompt: 'consent', // always return a refresh token
    include_granted_scopes: 'true',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`
}

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), ...params }),
  })
  const json: any = await res.json().catch(() => ({}))
  return { ok: res.ok, json }
}

export async function googleExchangeCode(event: H3Event, userId: string, code: string) {
  const { ok, json } = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(event) })
  if (!ok || !json.access_token) throw createError({ statusCode: 400, statusMessage: 'Google token exchange failed' })
  await saveTokens(userId, 'google', {
    access_token: json.access_token,
    ...(json.refresh_token ? { refresh_token: json.refresh_token } : {}),
    expires_at: new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString(),
    extra: { scope: json.scope ?? '' },
  })
}

/** Valid access token for the user, refreshing when it is within 60 s of expiry (or force). */
export async function getAccessToken(userId: string, force = false): Promise<string> {
  const t = await getTokens(userId, 'google')
  if (!t || (!t.access_token && !t.refresh_token)) throw createError({ statusCode: 401, statusMessage: 'Google Photos is not connected' })
  const fresh = t.access_token && t.expires_at && new Date(t.expires_at).getTime() > Date.now() + 60_000
  if (fresh && !force) return t.access_token!
  if (!t.refresh_token) throw createError({ statusCode: 401, statusMessage: 'Google connection expired; reconnect' })
  const { ok, json } = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh_token })
  if (!ok || !json.access_token) {
    if (json?.error === 'invalid_grant') await deleteTokens(userId, 'google')
    throw createError({ statusCode: 401, statusMessage: 'Google connection expired; reconnect' })
  }
  await saveTokens(userId, 'google', {
    access_token: json.access_token,
    expires_at: new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString(),
  })
  return json.access_token
}

/** fetch against Google with the user's token; refreshes once on 401. Errors never include tokens. */
export async function googleFetch(userId: string, url: string, init: RequestInit = {}): Promise<Response> {
  const call = async (token: string) =>
    fetch(url, { ...init, headers: { ...(init.headers || {}), authorization: `Bearer ${token}` } })
  let res = await call(await getAccessToken(userId))
  if (res.status === 401) res = await call(await getAccessToken(userId, true))
  return res
}

export async function pickerJson(userId: string, path: string, init: RequestInit = {}) {
  const res = await googleFetch(userId, `${PICKER_BASE}${path}`, init)
  if (!res.ok) {
    throw createError({ statusCode: res.status === 404 ? 404 : 502, statusMessage: `Google Photos Picker error (${res.status})` })
  }
  return res.json() as Promise<any>
}

export interface PickedItem {
  id: string
  createTime?: string
  type?: string
  filename?: string
  mimeType?: string
  width?: number
  height?: number
  baseUrl?: string
  latitude?: number
  longitude?: number
}

/** All items the user picked in a session (paginated). */
export async function listPicked(userId: string, sessionId: string): Promise<PickedItem[]> {
  const out: PickedItem[] = []
  let pageToken = ''
  do {
    const q = new URLSearchParams({ sessionId, pageSize: '100', ...(pageToken ? { pageToken } : {}) })
    const json = await pickerJson(userId, `/mediaItems?${q}`)
    for (const m of json.mediaItems ?? []) {
      const meta = m.mediaFile?.mediaFileMetadata ?? {}
      const loc = meta.location ?? m.location // not documented for Picker; pass through if ever present
      out.push({
        id: m.id,
        createTime: m.createTime,
        type: m.type,
        filename: m.mediaFile?.filename,
        mimeType: m.mediaFile?.mimeType,
        width: meta.width,
        height: meta.height,
        baseUrl: m.mediaFile?.baseUrl,
        latitude: typeof loc?.latitude === 'number' ? loc.latitude : undefined,
        longitude: typeof loc?.longitude === 'number' ? loc.longitude : undefined,
      })
    }
    pageToken = json.nextPageToken ?? ''
  } while (pageToken)
  return out
}

/** Public shape for the browser: never includes baseUrl. */
export const publicItem = ({ baseUrl, ...rest }: PickedItem) => rest
