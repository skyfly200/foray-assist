// Pure rules for pulling this account's own rows from Supabase into Dexie, so
// finds made on one device show up on the others (SPEC 4.3, last-write-wins on
// updatedAt). useSync.ts owns the I/O. Erasable TS only so node --test can load it.

export type PullTable = 'forays' | 'specimens' | 'photos' | 'voiceNotes'

/** Local table -> remote table, in the order they are pulled (parents first). */
export const PULL_TABLES: ReadonlyArray<{ table: PullTable; remote: string }> = [
  { table: 'forays', remote: 'forays' },
  { table: 'specimens', remote: 'specimens' },
  { table: 'photos', remote: 'photos' },
  { table: 'voiceNotes', remote: 'voice_notes' },
]

/** Server-only columns that have no local field. storage_path is read separately for media. */
const REMOTE_ONLY = new Set(['user_id', 'synced_at', 'storage_path', 'join_code', 'society_id', 'mesh_key'])
const CAMEL_OVERRIDES: Record<string, string> = { inat_observation_id: 'iNatObservationId' }
const camel = (s: string) => CAMEL_OVERRIDES[s] ?? s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase())

/** snake_case server row -> camelCase local row (nulls dropped, server-only columns dropped). */
export function remoteToLocal(table: PullTable, row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(row)) {
    if (REMOTE_ONLY.has(k) || v === null || v === undefined) continue
    out[camel(k)] = v
  }
  // Unassigned imported photos are '' locally and null on the server.
  if (table === 'photos' && out.specimenRowId === undefined) out.specimenRowId = ''
  if (table === 'specimens' && out.fieldNotes === undefined) out.fieldNotes = {}
  return out
}

const ms = (iso: unknown) => (typeof iso === 'string' ? Date.parse(iso) : NaN)

/**
 * Should a server row overwrite the local copy? Never while this device still has
 * the row queued for upload (its own edit will reach the server and win). Otherwise
 * the newer updatedAt wins; a row missing locally is always taken.
 */
export function shouldApply(local: { updatedAt?: string } | undefined, remoteUpdatedAt: string, pending: boolean): boolean {
  if (pending) return false
  if (!local) return true
  const l = ms(local.updatedAt)
  const r = ms(remoteUpdatedAt)
  if (Number.isNaN(r)) return false
  if (Number.isNaN(l)) return true
  return r > l
}

/**
 * Rows to remove locally after a FULL pull: ones this device already synced
 * (syncedAt set), has nothing queued for, did not get from someone else (joined
 * foray), and that the server no longer has, i.e. another device deleted them.
 * accountHasRows = the server returned at least one row for this account in any
 * table; if it has nothing at all (reset or misconfigured), nothing is removed.
 */
export function rowsDeletedElsewhere<T extends { id: string; syncedAt?: string; joined?: boolean }>(
  local: readonly T[], remoteIds: ReadonlySet<string>, pendingIds: ReadonlySet<string>, accountHasRows: boolean,
): string[] {
  if (!accountHasRows) return []
  return local
    .filter((r) => r.syncedAt && !r.joined && !pendingIds.has(r.id) && !remoteIds.has(r.id))
    .map((r) => r.id)
}

/** Look back this far past the cursor, so a device with a slightly slow clock is not skipped. */
export const PULL_OVERLAP_MS = 10 * 60_000

/** synced_at lower bound for an incremental pull, or null for a full pull. */
export function pullSince(cursor: string | undefined): string | null {
  const t = ms(cursor)
  return Number.isNaN(t) ? null : new Date(t - PULL_OVERLAP_MS).toISOString()
}

/** Latest synced_at seen, or the old cursor if nothing newer came back. */
export function advanceCursor(cursor: string | undefined, rows: ReadonlyArray<{ synced_at?: string }>): string | undefined {
  let best = ms(cursor)
  let out = cursor
  for (const r of rows) {
    const t = ms(r.synced_at)
    if (!Number.isNaN(t) && (Number.isNaN(best) || t > best)) { best = t; out = new Date(t).toISOString() }
  }
  return out
}
