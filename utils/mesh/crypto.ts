// Crypto for nearby sharing (roadmap Phase 13), on WebCrypto only (browser and Node 20+).
//
//   * Foray key: 32 random bytes the server hands every member of a shared foray (mesh_key).
//     Everything sent nearby is AES-GCM encrypted with it, so non-members only see noise.
//   * Device key: an ECDSA P-256 pair made on the device. The private key never leaves it
//     (non-extractable, kept in IndexedDB); the public key is published to device_keys so
//     co-members can check that a find or alert really came from its author.
// Pure module: erasable TypeScript, unit-tested under plain Node.

const subtle = () => globalThis.crypto.subtle
const te = new TextEncoder()
/** TS 5.7 typed-array generics vs. WebCrypto's BufferSource. */
const bs = (u: Uint8Array) => u as unknown as BufferSource

export function toB64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

export function fromB64(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

export const utf8 = (s: string) => te.encode(s)

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

export async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await subtle().digest('SHA-256', bs(bytes)))
}

export interface ForayKey {
  key: CryptoKey
  /** 2 bytes that tell a receiver which of its forays a message is for. Not secret. */
  hint: Uint8Array
}

export async function importForayKey(meshKeyB64: string): Promise<ForayKey> {
  const raw = fromB64(meshKeyB64)
  if (raw.length !== 32) throw new Error('foray key must be 32 bytes')
  const key = await subtle().importKey('raw', bs(raw), 'AES-GCM', false, ['encrypt', 'decrypt'])
  const hint = (await sha256(concat(utf8('fa-hint'), raw))).slice(0, 2)
  return { key, hint }
}

export async function seal(k: ForayKey, plain: Uint8Array, aad: Uint8Array): Promise<Uint8Array> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: bs(iv), additionalData: bs(aad) }, k.key, bs(plain)))
  return concat(iv, ct)
}

/** Returns null when the message isn't for this key or was tampered with. */
export async function open(k: ForayKey, sealed: Uint8Array, aad: Uint8Array): Promise<Uint8Array | null> {
  if (sealed.length < 12 + 16) return null
  try {
    return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: bs(sealed.slice(0, 12)), additionalData: bs(aad) }, k.key, bs(sealed.slice(12))))
  } catch {
    return null
  }
}

export interface DeviceKey {
  privateKey: CryptoKey
  publicKey: CryptoKey
  /** Raw uncompressed P-256 point (65 bytes), base64. */
  publicB64: string
  /** First 4 bytes of SHA-256(public key), hex: short sender id inside messages. */
  keyId: string
}

const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' } as const
const SIGN = { name: 'ECDSA', hash: 'SHA-256' } as const

export async function keyIdOf(publicRaw: Uint8Array): Promise<string> {
  return [...(await sha256(publicRaw)).slice(0, 4)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function generateDeviceKey(): Promise<DeviceKey> {
  const pair = (await subtle().generateKey(ECDSA, false, ['sign', 'verify'])) as CryptoKeyPair
  return deviceKeyFromPair(pair.privateKey, pair.publicKey)
}

export async function deviceKeyFromPair(privateKey: CryptoKey, publicKey: CryptoKey): Promise<DeviceKey> {
  const raw = new Uint8Array(await subtle().exportKey('raw', publicKey))
  return { privateKey, publicKey, publicB64: toB64(raw), keyId: await keyIdOf(raw) }
}

export async function importPublicKey(publicB64: string): Promise<CryptoKey> {
  return subtle().importKey('raw', bs(fromB64(publicB64)), ECDSA, true, ['verify'])
}

/** 64-byte raw (r || s) signature. */
export async function sign(k: DeviceKey, data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await subtle().sign(SIGN, k.privateKey, bs(data)))
}

export async function verify(publicKey: CryptoKey, sig: Uint8Array, data: Uint8Array): Promise<boolean> {
  try {
    return await subtle().verify(SIGN, publicKey, bs(sig), bs(data))
  } catch {
    return false
  }
}

/** Looks up a sender's public key by key id (from the cached member list). */
export type KeyLookup = (keyId: string) => Promise<CryptoKey | null>
