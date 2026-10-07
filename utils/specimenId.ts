// Local Specimen ID generator (format and guarantees: utils/idCode.ts).
// The device holds a stock of server-issued sets in Dexie `settings` key 'idSets'
// (see utils/idStock.ts) and counts up inside them. If the stock is empty the find is
// logged with an empty ID ("ID pending") and receives its real ID automatically when sets
// arrive (assignPendingIds). Nothing here ever invents an ID, so every ID that exists was
// issued by the server to this device.
import { useDb, enqueue, nowIso } from './db'
import { takeId, type IdSet } from './idStock'

export const ID_SETS_KEY = 'idSets'

async function readSets(db: ReturnType<typeof useDb>): Promise<IdSet[]> {
  return ((await db.settings.get(ID_SETS_KEY))?.value as IdSet[] | undefined) ?? []
}

/** Tell listeners (the stock refiller, UI) that the stock changed. Browser only. */
export function notifyStockChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('fa-id-stock'))
}

/** Reserve the next specimen ID, or '' (pending) when this device has none. Safe to call concurrently. */
export async function nextSpecimenId(): Promise<string> {
  const db = useDb()
  const id = await db.transaction('rw', db.settings, async () => {
    const r = takeId(await readSets(db))
    if (r.id) await db.settings.put({ key: ID_SETS_KEY, value: r.sets })
    return r.id
  })
  notifyStockChanged()
  return id ?? ''
}

/** Give real IDs to finds logged while the stock was empty, oldest first. Returns how many were assigned. */
export async function assignPendingIds(): Promise<number> {
  const db = useDb()
  const n = await db.transaction('rw', db.settings, db.specimens, db.outbox, async () => {
    let sets = await readSets(db)
    const pending = (await db.specimens.filter((s) => !s.specimenId).toArray()).sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    let count = 0
    for (const s of pending) {
      const r = takeId(sets)
      if (!r.id) break
      sets = r.sets
      await db.specimens.update(s.id, { specimenId: r.id, updatedAt: nowIso() })
      await enqueue('specimens', s.id)
      count++
    }
    if (count) await db.settings.put({ key: ID_SETS_KEY, value: sets })
    return count
  })
  if (n) notifyStockChanged()
  return n
}
