// Specimen ID format: PREFIX-YYYYMMDD-DD-NNN, e.g. FORAY-20261005-K7-001
//  - YYYYMMDD uses the device's LOCAL date (a 7pm find is not "tomorrow").
//  - DD is a short per-device tag so two of the user's devices never collide.
//  - NNN is a per-device, per-day sequence assigned inside a Dexie rw
//    transaction, so rapid double-taps can't produce duplicates.
import { useDb } from './db'

const PREFIX = 'FORAY'
const TAG_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function localDateStamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}

async function deviceTag(): Promise<string> {
  const db = useDb()
  const existing = await db.settings.get('deviceTag')
  if (existing) return existing.value as string
  const bytes = crypto.getRandomValues(new Uint8Array(2))
  const tag = Array.from(bytes, (b) => TAG_ALPHABET[b % TAG_ALPHABET.length]).join('')
  // put-if-absent inside a tx to survive a race between tabs
  return db.transaction('rw', db.settings, async () => {
    const again = await db.settings.get('deviceTag')
    if (again) return again.value as string
    await db.settings.put({ key: 'deviceTag', value: tag })
    return tag
  })
}

/** Reserve the next specimen ID. Safe to call concurrently. */
export async function nextSpecimenId(): Promise<string> {
  const db = useDb()
  const tag = await deviceTag()
  const date = localDateStamp()
  const key = `seq:${date}`
  return db.transaction('rw', db.settings, async () => {
    const cur = ((await db.settings.get(key))?.value as number | undefined) ?? 0
    const next = cur + 1
    await db.settings.put({ key, value: next })
    return `${PREFIX}-${date}-${tag}-${String(next).padStart(3, '0')}`
  })
}
