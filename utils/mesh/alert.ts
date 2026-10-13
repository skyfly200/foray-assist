// Nearby find alerts (roadmap Phase 13, tier 1): a tiny, encrypted, signed message such as
// "B7QM-4T9R-X, Amanita muscaria, within 200 m of here, 10:42". Sized for Bluetooth extended
// advertising (up to 255 bytes); an alert is 128 bytes.
//
// Wire format:
//   0     version (1)
//   1-2   foray hint (2)            which shared foray's key opens it
//   3-6   sender key id (4)         the author's device key, for the signature
//   7-..  AES-GCM( iv 12 | body 29 | tag 16 )  with the foray key, header as associated data
//   last  ECDSA P-256 signature (64) over everything before it
// Body (29 bytes): kind+precision (1), specimen id 9 x 5 bits (6), location cell (5),
//   minutes since 1970 (4), species text, UTF-8, zero padded (13).
import { ID_ALPHABET } from '../idCode.ts'
import { concat, open, seal, sign, verify, type DeviceKey, type ForayKey, type KeyLookup } from './crypto.ts'

export const ALERT_VERSION = 1
export const ALERT_BYTES = 1 + 2 + 4 + 12 + 29 + 16 + 64
const BODY = 29
const SPECIES_BYTES = 13
const FINE = 0.002 // degrees, about 200 m
const COARSE = 0.2 // degrees, about 20 km: same cell size the server uses for "obscured"

export interface FindForAlert {
  specimenId: string
  latitude?: number
  longitude?: number
  geoprivacy: 'open' | 'obscured' | 'private'
  speciesGuess?: string
  timestamp: string
}

export interface Alert {
  specimenId: string
  /** Centre of the cell the find is in; undefined when it had no location. */
  latitude?: number
  longitude?: number
  /** Cell size in metres (about 200 or 20,000). */
  precisionM?: number
  species: string
  at: string
  keyId: string
}

/**
 * Species that are never announced nearby (protected, or easily over-picked). Matched on the
 * start of the guess, case-insensitive. Kept short and editable; finds marked private are
 * never announced either.
 */
export const SENSITIVE_SPECIES = ['tricholoma matsutake', 'morchella', 'boletus edulis', 'cantharellus', 'hericium']

export function shouldAlert(f: FindForAlert, sensitive: string[] = SENSITIVE_SPECIES): boolean {
  if (f.geoprivacy === 'private' || !f.specimenId) return false
  const g = (f.speciesGuess ?? '').trim().toLowerCase()
  return !sensitive.some((s) => g.startsWith(s.toLowerCase()))
}

function packId(id: string): Uint8Array {
  if (id.length !== 9) throw new Error('alerts carry 9-character IDs')
  let n = 0n
  for (const c of id) {
    const i = ID_ALPHABET.indexOf(c)
    if (i < 0) throw new Error('bad ID character')
    n = (n << 5n) | BigInt(i)
  }
  const out = new Uint8Array(6)
  for (let i = 5; i >= 0; i--) { out[i] = Number(n & 0xffn); n >>= 8n }
  return out
}

function unpackId(b: Uint8Array): string {
  let n = 0n
  for (const x of b) n = (n << 8n) | BigInt(x)
  let s = ''
  for (let i = 0; i < 9; i++) { s = ID_ALPHABET[Number(n & 31n)] + s; n >>= 5n }
  return s
}

/** 17 bits of latitude cell + 18 bits of longitude cell (+ 5 spare) in 5 bytes; all ones = none. */
function packCell(lat: number | undefined, lon: number | undefined, step: number): Uint8Array {
  const out = new Uint8Array(5).fill(0xff)
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return out
  const la = Math.min(Math.floor((lat + 90) / step), 2 ** 17 - 2)
  const lo = Math.min(Math.floor((((lon + 180) % 360) + 360) % 360 / step), 2 ** 18 - 1)
  const v = (BigInt(la) << 18n) | BigInt(lo)
  let x = v << 5n
  for (let i = 4; i >= 0; i--) { out[i] = Number(x & 0xffn); x >>= 8n }
  return out
}

function unpackCell(b: Uint8Array, step: number): { latitude?: number; longitude?: number } {
  let x = 0n
  for (const v of b) x = (x << 8n) | BigInt(v)
  x >>= 5n
  const la = Number(x >> 18n)
  const lo = Number(x & ((1n << 18n) - 1n))
  if (la === 2 ** 17 - 1) return {}
  return { latitude: -90 + (la + 0.5) * step, longitude: -180 + (lo + 0.5) * step }
}

export function encodeBody(f: FindForAlert): Uint8Array {
  const coarse = f.geoprivacy !== 'open'
  const step = coarse ? COARSE : FINE
  const body = new Uint8Array(BODY)
  body[0] = 1 | (coarse ? 0x10 : 0)
  body.set(packId(f.specimenId), 1)
  body.set(packCell(f.latitude, f.longitude, step), 7)
  const mins = Math.floor(Date.parse(f.timestamp) / 60000)
  new DataView(body.buffer).setUint32(12, mins >>> 0)
  // Truncate on a character boundary so the text always decodes.
  const enc = new TextEncoder()
  let sp = ''
  for (const ch of (f.speciesGuess ?? '').trim()) {
    if (enc.encode(sp + ch).length > SPECIES_BYTES) break
    sp += ch
  }
  body.set(enc.encode(sp), 16)
  return body
}

export function decodeBody(body: Uint8Array, keyId: string): Alert {
  const coarse = (body[0]! & 0x10) !== 0
  const step = coarse ? COARSE : FINE
  const cell = unpackCell(body.slice(7, 12), step)
  const mins = new DataView(body.buffer, body.byteOffset).getUint32(12)
  const sp = body.slice(16, 16 + SPECIES_BYTES)
  const end = sp.indexOf(0)
  return {
    specimenId: unpackId(body.slice(1, 7)),
    ...cell,
    precisionM: cell.latitude == null ? undefined : Math.round(step * 111_000),
    species: new TextDecoder().decode(end < 0 ? sp : sp.slice(0, end)),
    at: new Date(mins * 60000).toISOString(),
    keyId,
  }
}

function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/../g)!.map((h) => parseInt(h, 16)))
}

export async function encodeAlert(f: FindForAlert, foray: ForayKey, device: DeviceKey): Promise<Uint8Array> {
  const header = concat(new Uint8Array([ALERT_VERSION]), foray.hint, hexToBytes(device.keyId))
  const sealed = await seal(foray, encodeBody(f), header)
  const signed = concat(header, sealed)
  return concat(signed, await sign(device, signed))
}

/** Null for anything that isn't a genuine alert for this foray from a known member device. */
export async function decodeAlert(bytes: Uint8Array, foray: ForayKey, lookup: KeyLookup): Promise<Alert | null> {
  if (bytes.length !== ALERT_BYTES || bytes[0] !== ALERT_VERSION) return null
  if (bytes[1] !== foray.hint[0] || bytes[2] !== foray.hint[1]) return null
  const keyId = [...bytes.slice(3, 7)].map((b) => b.toString(16).padStart(2, '0')).join('')
  const pub = await lookup(keyId)
  if (!pub) return null
  const signed = bytes.slice(0, ALERT_BYTES - 64)
  if (!(await verify(pub, bytes.slice(ALERT_BYTES - 64), signed))) return null
  const body = await open(foray, signed.slice(7), signed.slice(0, 7))
  if (!body || body.length !== BODY) return null
  return decodeBody(body, keyId)
}

/** Great-circle distance in metres. */
export function distanceM(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** "3 finds within 200 m": alerts near `here` received in the last `windowMin` minutes. */
export function nearbySummary(alerts: Alert[], here: { latitude: number; longitude: number } | null, radiusM = 200, windowMin = 120, now = Date.now()) {
  const recent = alerts.filter((a) => now - Date.parse(a.at) <= windowMin * 60000)
  const near = here
    ? recent.filter((a) => a.latitude != null && a.longitude != null && distanceM(here, { latitude: a.latitude!, longitude: a.longitude! }) <= radiusM + (a.precisionM ?? 0) / 2)
    : []
  return { recent: recent.length, near: near.length, radiusM }
}
