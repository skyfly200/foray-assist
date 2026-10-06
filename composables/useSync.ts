// Sync status + engine (SPEC 4.3). Local Dexie is the source of truth; this
// drains the outbox to Supabase when online AND signed in. Never throws; with
// no Supabase env it degrades to signedIn=false. Return shape is a contract.
import { liveQuery } from 'dexie'
import { countParked, countPending, pickNext, planFailure, type SyncOutboxItem } from '../utils/syncPolicy'

const MEDIA_BUCKET = 'foray-media'

// Singleton state shared by the plugin and any page calling useSync().
const online = ref(true)
const pending = ref(0) // queued items, EXCLUDING parked ones
const parked = ref(0) // items parked after repeated permanent failures (data stays local)
const signedIn = ref(false)
const syncing = ref(false)

let initialised = false
let client: any = null
let userId: string | null = null

function getClient(): any {
  if (client) return client
  try {
    const cfg: any = useRuntimeConfig().public
    if (!cfg?.supabase?.url || !cfg?.supabase?.key) return null
    client = useSupabaseClient()
  } catch {
    client = null
  }
  return client
}

function init() {
  if (initialised || !import.meta.client) return
  initialised = true
  online.value = navigator.onLine
  window.addEventListener('online', () => (online.value = true))
  window.addEventListener('offline', () => (online.value = false))
  try {
    // Retry state is persisted on the rows (nextAttemptAt/parkedAt); outbox stays small.
    liveQuery(() => useDb().outbox.toArray()).subscribe({
      next: (items) => {
        pending.value = countPending(items as SyncOutboxItem[])
        parked.value = countParked(items as SyncOutboxItem[])
      },
      error: () => {},
    })
  } catch { /* IndexedDB unavailable */ }
  const sb = getClient()
  if (!sb) return
  const apply = (session: any) => {
    userId = session?.user?.id ?? null
    signedIn.value = !!userId
  }
  sb.auth.getSession().then(({ data }: any) => apply(data?.session)).catch(() => {})
  sb.auth.onAuthStateChange((_e: string, session: any) => apply(session))
}

const SNAKE_OVERRIDES: Record<string, string> = { iNatObservationId: 'inat_observation_id' }
const snake = (s: string) => SNAKE_OVERRIDES[s] ?? s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())
/** camelCase -> snake_case, drop Blobs / undefined / local-only keys. */
function toRow(obj: Record<string, any>, drop: string[] = []): Record<string, any> {
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v instanceof Blob || drop.includes(k)) continue
    out[snake(k)] = v === '' && k === 'specimenRowId' ? null : (v ?? null)
  }
  return out
}

const TABLE_MAP = {
  forays: { remote: 'forays', drop: ['syncedAt'] },
  specimens: { remote: 'specimens', drop: ['syncedAt'] },
  photos: { remote: 'photos', drop: ['syncedAt', 'blob'] },
  voiceNotes: { remote: 'voice_notes', drop: ['syncedAt', 'audio'] },
} as const

async function processItem(sb: any, item: OutboxItem) {
  const db = useDb()
  const map = TABLE_MAP[item.table]
  if (!map) return // unknown table: discard
  const mediaPath = (kind: 'photos' | 'voice') => `${userId}/${kind}/${item.rowId}`

  if (item.op === 'delete') {
    const { error } = await sb.from(map.remote).delete().eq('id', item.rowId)
    if (error) throw error
    if (item.table === 'photos' || item.table === 'voiceNotes') {
      // deterministic path; best-effort, a missing object is not an error
      await sb.storage.from(MEDIA_BUCKET).remove([mediaPath(item.table === 'photos' ? 'photos' : 'voice')])
    }
    return
  }

  const row: any = await (db as any)[item.table].get(item.rowId)
  if (!row) return // deleted locally since queued; a delete item (if any) follows

  let blob: Blob | undefined
  let path: string | undefined
  if (item.table === 'photos' && row.blob instanceof Blob) { blob = row.blob; path = mediaPath('photos') }
  if (item.table === 'voiceNotes' && row.audio instanceof Blob) { blob = row.audio; path = mediaPath('voice') }

  const payload = toRow(row, [...map.drop])
  if (path) payload.storage_path = path
  payload.synced_at = nowIso()
  // user_id is filled by the column default auth.uid(); upsert on id is idempotent.
  const { error } = await sb.from(map.remote).upsert(payload, { onConflict: 'id' })
  if (error) throw error

  if (blob && path) {
    const { error: upErr } = await sb.storage.from(MEDIA_BUCKET)
      .upload(path, blob, { upsert: true, contentType: blob.type || row.mimeType || undefined })
    if (upErr) throw upErr
  }
  // Mark synced without touching updatedAt (not a user edit).
  await (db as any)[item.table].update(item.rowId, { syncedAt: nowIso() })
}

async function syncNow(): Promise<void> {
  init()
  if (syncing.value || !online.value || !signedIn.value) return
  const sb = getClient()
  if (!sb || !userId) return
  syncing.value = true
  try {
    const db = useDb()
    // Re-read each round so persisted retry state drives the next pick. Every
    // round either deletes the item or pushes its nextAttemptAt/parkedAt forward,
    // so the loop terminates. Per-row ordering + parking live in pickNext().
    for (;;) {
      const items = (await db.outbox.orderBy('id').toArray()) as SyncOutboxItem[]
      const item = pickNext(items, Date.now())
      if (!item) break
      const id = item.id!
      try {
        await processItem(sb, item)
        await db.outbox.delete(id)
      } catch (e: any) {
        const plan = planFailure(item, e, Date.now())
        await db.outbox.update(id, plan.patch as any)
        if (plan.stop) break // offline/outage/auth: retry later, others would fail too
        // permanent: backed off or parked; carry on with unrelated rows
      }
    }
  } catch { /* never throw */ } finally {
    syncing.value = false
  }
}

/** Parked items get another go: clears parkedAt/attempts/backoff, then drains. */
async function retryParked(): Promise<void> {
  try {
    const db = useDb()
    await db.outbox.filter((i: any) => !!i.parkedAt).modify((i: any) => {
      delete i.parkedAt
      delete i.nextAttemptAt
      delete i.lastError
      i.attempts = 0
    })
  } catch { /* never throw */ }
  await syncNow()
}

/**
 * Deletes parked outbox items. Local data is NOT touched: the rows stay in
 * Dexie, they just never sync (until edited again, which re-enqueues them).
 * Operations queued behind a discarded item on the same row are unblocked.
 */
async function discardParked(): Promise<void> {
  try {
    const db = useDb()
    const ids = (await db.outbox.toArray()).filter((i: any) => i.parkedAt).map((i) => i.id!)
    await db.outbox.bulkDelete(ids)
  } catch { /* never throw */ }
  void syncNow()
}

export function useSync() {
  init()
  return { online, pending, parked, signedIn, syncing, syncNow, retryParked, discardParked }
}
