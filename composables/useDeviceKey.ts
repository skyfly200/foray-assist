// This device's signing key for nearby sharing (Phase 13). Made once, kept in IndexedDB as
// non-extractable CryptoKeys (the private key can't be read out, even by the app). The public
// half is published to device_keys when signed in, so co-members can verify our alerts and
// finds; it reaches them through foray_member_list and is cached with the foray.
import { deviceKeyFromPair, generateDeviceKey, importPublicKey, type DeviceKey, type KeyLookup } from '~/utils/mesh/crypto'
import type { Foray } from '~/utils/db'

let cached: Promise<DeviceKey> | null = null

export function getDeviceKey(): Promise<DeviceKey> {
  if (!cached) {
    cached = (async () => {
      const db = useDb()
      const row = (await db.settings.get('deviceKey'))?.value as { privateKey: CryptoKey; publicKey: CryptoKey } | undefined
      if (row?.privateKey && row?.publicKey) return deviceKeyFromPair(row.privateKey, row.publicKey)
      const k = await generateDeviceKey()
      await db.settings.put({ key: 'deviceKey', value: { privateKey: k.privateKey, publicKey: k.publicKey } })
      return k
    })().catch((e) => { cached = null; throw e })
  }
  return cached
}

async function deviceIdSetting(): Promise<string> {
  const db = useDb()
  const existing = (await db.settings.get('deviceId'))?.value as string | undefined
  if (existing) return existing
  const id = crypto.randomUUID()
  await db.settings.put({ key: 'deviceId', value: id })
  return id
}

/** Publish the public key once per key (needs a session). Never throws. */
export async function publishDeviceKey(): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    const db = useDb()
    const k = await getDeviceKey()
    if ((await db.settings.get('deviceKeyPublished'))?.value === k.keyId) return
    const sb = useSupabaseClient()
    const { data } = await sb.auth.getSession()
    if (!data.session) return
    const { error } = await (sb as any).from('device_keys').upsert(
      { device_id: await deviceIdSetting(), key_id: k.keyId, public_key: k.publicB64 },
      { onConflict: 'user_id,device_id' },
    )
    if (!error) await db.settings.put({ key: 'deviceKeyPublished', value: k.keyId })
  } catch { /* offline or not configured: try again next time */ }
}

/** Key lookup over a foray's cached member list (works offline). Includes our own key. */
export function keyLookupFor(foray: Foray | null | undefined): KeyLookup {
  const cache = new Map<string, CryptoKey | null>()
  return async (keyId: string) => {
    if (cache.has(keyId)) return cache.get(keyId)!
    let found: CryptoKey | null = null
    const mine = await getDeviceKey()
    if (mine.keyId === keyId) found = mine.publicKey
    for (const m of foray?.shared?.members ?? []) {
      const k = m.keys.find((x) => x.key_id === keyId)
      if (k) { found = await importPublicKey(k.public_key).catch(() => null); break }
    }
    cache.set(keyId, found)
    return found
  }
}

/** Display name for a key id, from the foray's cached member list. */
export function memberNameFor(foray: Foray | null | undefined, keyId: string): string | undefined {
  return foray?.shared?.members?.find((m) => m.keys.some((k) => k.key_id === keyId))?.displayName || undefined
}
