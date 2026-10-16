// Sync status + engine (SPEC 4.3). Local Dexie is the source of truth; this
// drains the outbox to Supabase when online AND signed in. Never throws; with
// no Supabase env it degrades to signedIn=false. Return shape is a contract.
import { liveQuery } from 'dexie'
import { countParked, countPending, pickNext, planFailure, type SyncOutboxItem } from '../utils/syncPolicy'
import { stripPhotoBlob } from '../utils/jpeg'
import { PULL_TABLES, advanceCursor, pullSince, remoteToLocal, rowsDeletedElsewhere, shouldApply, type PullTable } from '../utils/syncPull'

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
  forays: { remote: 'forays', drop: ['syncedAt', 'shared', 'joined'] },
  specimens: { remote: 'specimens', drop: ['syncedAt'] },
  photos: { remote: 'photos', drop: ['syncedAt', 'blob'] },
  voiceNotes: { remote: 'voice_notes', drop: ['syncedAt', 'audio'] },
  comments: { remote: 'find_comments', drop: ['syncedAt', 'authorName', 'userId', 'mine'] },
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
  // A foray someone else shared with us is theirs: only its owner writes the row.
  if (item.table === 'forays' && (row.joined || (row.shared && row.shared.role !== 'owner'))) return

  let blob: Blob | undefined
  let path: string | undefined
  // Media is uploaded once; after that (or for media that came from another device) only the row changes.
  // Uploaded photos lose their EXIF (GPS) so a find's location setting holds once it is shared.
  if (!row.storagePath) {
    if (item.table === 'photos' && row.blob instanceof Blob) { blob = await stripPhotoBlob(row.blob); path = mediaPath('photos') }
    if (item.table === 'voiceNotes' && row.audio instanceof Blob) { blob = row.audio; path = mediaPath('voice') }
  }

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
  await (db as any)[item.table].update(item.rowId, { syncedAt: nowIso(), ...(path ? { storagePath: path } : {}) })
}

const PAGE = 500
type PullCursors = Partial<Record<PullTable, string>>
let pulledFullThisSession = false

/**
 * Download this account's rows that other devices uploaded (SPEC 4.3). Incremental
 * by synced_at; a full pull (first sync of a session, or Sync now) also removes
 * rows another device deleted. Photo images and voice audio are not downloaded
 * here; they load the first time they are shown (composables/useMedia.ts).
 */
async function pullRemote(sb: any, full: boolean) {
  const db: any = useDb()
  const cursors: PullCursors = full ? {} : (((await db.settings.get('pullCursor'))?.value as PullCursors) ?? {})
  const next: PullCursors = { ...cursors }
  const outbox = await db.outbox.toArray()
  // Only remove rows another device deleted when this device has only ever synced this
  // account; after switching accounts, the old account's rows are simply left alone.
  const owner = (await db.settings.get('syncUserId'))?.value as string | undefined
  if (!owner) await db.settings.put({ key: 'syncUserId', value: userId })
  const mayDelete = full && (!owner || owner === userId)
  const seen: Array<{ table: PullTable; ids: Set<string>; pending: Set<string> }> = []

  for (const { table, remote } of PULL_TABLES) {
    const since = pullSince(cursors[table])
    const rows: any[] = []
    for (let from = 0; ; from += PAGE) {
      let q = sb.from(remote).select('*').eq('user_id', userId).order('synced_at').order('id').range(from, from + PAGE - 1)
      if (since) q = q.gte('synced_at', since)
      const { data, error } = await q
      if (error) throw error
      rows.push(...(data ?? []))
      if (!data || data.length < PAGE) break
    }
    const pending = new Set<string>(outbox.filter((o: any) => o.table === table).map((o: any) => o.rowId))

    for (const r of rows) {
      const local = await db[table].get(r.id)
      if (!shouldApply(local, r.updated_at, pending.has(r.id))) continue
      // Keep local-only fields (a foray's sharing state, media already on this device).
      await db[table].put({ ...local, ...remoteToLocal(table, r), syncedAt: r.synced_at })
    }

    if (mayDelete) seen.push({ table, ids: new Set(rows.map((r) => r.id)), pending })
    next[table] = advanceCursor(cursors[table], rows)
  }
  const accountHasRows = seen.some((t) => t.ids.size > 0)
  for (const { table, ids, pending } of seen) {
    const gone = rowsDeletedElsewhere(await db[table].toArray(), ids, pending, accountHasRows)
    if (gone.length) await db[table].bulkDelete(gone)
  }
  await db.settings.put({ key: 'pullCursor', value: next })
}

async function syncNow(opts: { full?: boolean } = {}): Promise<void> {
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
    // Upload first so this device's edits are on the server before others' are merged in.
    const full = !!opts.full || !pulledFullThisSession
    await pullRemote(sb, full)
    if (full) pulledFullThisSession = true
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
  return { online, pending, parked, signedIn, syncing, syncNow, retryParked, discardParked, currentUserId: () => userId }
}
