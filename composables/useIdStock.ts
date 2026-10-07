// Keeps this device's stock of reserved ID sets topped up from the server.
// Needs: a verified (signed-in) session, a connection, and the claim_id_sets function
// (supabase/migrations/0005). Everything else in the app works without it: finds logged
// while the stock is empty show "ID pending" and are numbered when sets arrive.
import { remaining, mergeSets, needsRefill, type IdSet } from '~/utils/idStock'
import { ID_SETS_KEY, assignPendingIds, notifyStockChanged } from '~/utils/specimenId'

const left = ref(0) // IDs left in the stock
const claiming = ref(false)
const error = ref('')
const lastClaimAt = ref('')
const pending = ref(0) // finds waiting for an ID

const INITIAL_SETS = 4 // 4,096 IDs on first claim
const REFILL_SETS = 2

async function deviceId(): Promise<string> {
  const db = useDb()
  const existing = await db.settings.get('deviceId')
  if (existing) return existing.value as string
  return db.transaction('rw', db.settings, async () => {
    const again = await db.settings.get('deviceId')
    if (again) return again.value as string
    const id = crypto.randomUUID()
    await db.settings.put({ key: 'deviceId', value: id })
    return id
  })
}

async function refresh() {
  const db = useDb()
  const sets = ((await db.settings.get(ID_SETS_KEY))?.value as IdSet[] | undefined) ?? []
  left.value = remaining(sets)
  pending.value = await db.specimens.filter((s) => !s.specimenId).count()
}

async function claim(force = false) {
  if (claiming.value) return
  if (typeof navigator !== 'undefined' && !navigator.onLine) return
  const sb = useSupabaseClient()
  const { data: sess } = await sb.auth.getSession()
  if (!sess.session) return // not signed in yet: nothing to claim with
  const db = useDb()
  const sets = ((await db.settings.get(ID_SETS_KEY))?.value as IdSet[] | undefined) ?? []
  if (!force && !needsRefill(sets) && pending.value === 0) return
  claiming.value = true
  error.value = ''
  try {
    const count = sets.length === 0 ? INITIAL_SETS : REFILL_SETS
    const { data, error: err } = await sb.rpc('claim_id_sets', { p_device_id: await deviceId(), p_count: count })
    if (err) throw new Error(err.message)
    const incoming = ((data ?? []) as Array<{ network: string; set_no: number }>).map((r) => ({ network: r.network, set: r.set_no }))
    await db.transaction('rw', db.settings, async () => {
      const cur = ((await db.settings.get(ID_SETS_KEY))?.value as IdSet[] | undefined) ?? []
      await db.settings.put({ key: ID_SETS_KEY, value: mergeSets(cur, incoming) })
    })
    lastClaimAt.value = new Date().toISOString()
    await assignPendingIds()
    notifyStockChanged()
  } catch (e: any) {
    error.value = e?.message ?? String(e)
  } finally {
    claiming.value = false
    await refresh()
  }
}

export function useIdStock() {
  return {
    /** IDs left in this device's stock. */
    left,
    /** Finds still waiting for an ID. */
    pending,
    claiming,
    /** Last claim error ('' when fine). */
    error,
    lastClaimAt,
    refresh,
    /** Ask the server for sets now (also assigns IDs to pending finds). */
    claimNow: () => claim(true),
    /** Ask only if the stock is low or finds are pending. */
    ensureStock: () => claim(false),
  }
}
