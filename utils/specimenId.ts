// Local Specimen ID generator (see utils/idCode.ts for the format, e.g. SF-M042K).
// State lives in Dexie `settings`:
//   'collectorCode'  2-3 letter code, default 'SF'
//   'idState'        { block: 'M', next: 43, used: ['M'] }  this device's current block
// IDs are assigned inside a Dexie rw transaction so rapid double-taps can't duplicate.
// Each device draws its own random block; two devices could (rarely) pick the same block
// before syncing, which the database's unique index on (user_id, specimen_id) surfaces as a
// parked sync item instead of silently merging. Reserved blocks (roadmap Phase 7) remove that.
import { useDb } from './db'
import { BLOCK_SIZE, DEFAULT_COLLECTOR, formatId, normalizeCollector, pickBlock } from './idCode'

interface IdState {
  block: string
  next: number
  used: string[]
}

export async function getCollectorCode(): Promise<string> {
  const s = await useDb().settings.get('collectorCode')
  return normalizeCollector((s?.value as string | undefined) ?? DEFAULT_COLLECTOR)
}

export async function setCollectorCode(code: string): Promise<string> {
  const norm = normalizeCollector(code)
  await useDb().settings.put({ key: 'collectorCode', value: norm })
  return norm
}

/** Reserve the next specimen ID. Safe to call concurrently. */
export async function nextSpecimenId(): Promise<string> {
  const db = useDb()
  return db.transaction('rw', db.settings, async () => {
    const collector = normalizeCollector((await db.settings.get('collectorCode'))?.value as string | undefined)
    let st = (await db.settings.get('idState'))?.value as IdState | undefined
    if (!st || st.next > BLOCK_SIZE) {
      const used = st?.used ?? []
      const block = pickBlock(used)
      if (!block) throw new Error('This device has used all of its ID blocks. Change the collector code to continue.')
      st = { block, next: 1, used: [...used, block] }
    }
    const id = formatId(collector, st.block, st.next)
    await db.settings.put({ key: 'idState', value: { ...st, next: st.next + 1 } })
    return id
  })
}
