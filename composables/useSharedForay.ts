// Shared forays (roadmap Phase 12). Sharing and joining need a connection and a verified
// sign-in; everything else keeps working offline: the foray, its member list and the last
// copy of everyone's finds are cached in Dexie, and our own finds and comments queue in the
// outbox as usual. While the foray screen is open and online, the feed refreshes every 20 s.
// Server side: supabase/migrations/0006_shared_forays.sql.
import { feedRowToPeerFind, mergeFeed, normalizeJoinCode, type FeedRow } from '~/utils/sharing'
import type { FindComment, Foray, ForayMember, SharedInfo } from '~/utils/db'
import { publishDeviceKey } from './useDeviceKey'

const POLL_MS = 20_000

function client(): any {
  const cfg: any = useRuntimeConfig().public
  if (!cfg?.syncConfigured) throw new Error('Sharing needs the app to be connected to Supabase (see SETUP.md).')
  return useSupabaseClient()
}

async function requireSession(): Promise<{ sb: any; userId: string; email: string }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error("You're offline. Sharing needs a connection.")
  const sb = client()
  const { data } = await sb.auth.getSession()
  const user = data?.session?.user
  if (!user) throw new Error('Sign in on the Settings page first.')
  return { sb, userId: user.id, email: user.email ?? '' }
}

/** Plain-language versions of the server's errors. */
function friendly(msg: string): string {
  if (/verified email required/i.test(msg)) return 'Confirm your email (Settings, sign in) before sharing or joining.'
  if (/join code not found/i.test(msg)) return "That code didn't match a shared foray. Check it with the person who shared it; it may have been changed."
  if (/function .* does not exist|schema cache/i.test(msg)) return 'The server is missing the shared-foray update (migration 0006, see SETUP.md).'
  return msg
}

async function rpc<T = any>(sb: any, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.rpc(fn, args)
  if (error) throw new Error(friendly(error.message ?? String(error)))
  return data as T
}

export async function getDisplayName(fallbackEmail = ''): Promise<string> {
  const v = (await useDb().settings.get('displayName'))?.value as string | undefined
  return v || (fallbackEmail ? fallbackEmail.split('@')[0]! : '')
}

export async function setDisplayName(name: string) {
  await useDb().settings.put({ key: 'displayName', value: name.trim().slice(0, 60) })
}

async function patchShared(forayId: string, patch: Partial<SharedInfo>) {
  const db = useDb()
  await db.transaction('rw', db.forays, async () => {
    const f = await db.forays.get(forayId)
    if (!f) return
    await db.forays.update(forayId, { shared: { ...(f.shared ?? { role: 'member' }), ...patch } as SharedInfo })
  })
}

/** Owner: turn sharing on (or get the existing code). Returns the join code. */
export async function shareForay(foray: Foray, displayName: string): Promise<string> {
  const { sb } = await requireSession()
  await setDisplayName(displayName)
  const rows = await rpc<any[]>(sb, 'share_foray', {
    p_foray_id: foray.id, p_name: foray.name, p_started_at: foray.startedAt, p_display_name: displayName, p_society_id: null,
  })
  const r = rows?.[0]
  await patchShared(foray.id, { role: 'owner', joinCode: r?.join_code ?? null, meshKey: r?.mesh_key, societyName: r?.society_name ?? null })
  void publishDeviceKey()
  void refreshForay(foray.id)
  return r?.join_code
}

/** Officer or leader: share as a society foray. */
export async function shareSocietyForay(foray: Foray, displayName: string, societyId: string): Promise<string> {
  const { sb } = await requireSession()
  const rows = await rpc<any[]>(sb, 'share_foray', {
    p_foray_id: foray.id, p_name: foray.name, p_started_at: foray.startedAt, p_display_name: displayName, p_society_id: societyId,
  })
  const r = rows?.[0]
  await patchShared(foray.id, { role: 'owner', joinCode: r?.join_code ?? null, meshKey: r?.mesh_key, societyName: r?.society_name ?? null })
  void refreshForay(foray.id)
  return r?.join_code
}

/** Join with a code. Creates (or updates) the local copy of the foray and returns its id. */
export async function joinForay(codeInput: string, displayName: string): Promise<string> {
  const code = normalizeJoinCode(codeInput)
  if (!code) throw new Error('A join code is 8 letters and numbers, like ABCD-EFGH.')
  const { sb } = await requireSession()
  await setDisplayName(displayName)
  const rows = await rpc<any[]>(sb, 'join_foray', { p_code: code, p_display_name: displayName })
  const r = rows?.[0]
  if (!r) throw new Error('Could not join this foray.')
  const db = useDb()
  const shared: SharedInfo = {
    role: r.role, joinCode: r.join_code, meshKey: r.mesh_key, societyName: r.society_name, ownerName: r.owner_name,
  }
  await db.transaction('rw', db.forays, async () => {
    const cur = await db.forays.get(r.foray_id)
    const joined = r.role !== 'owner'
    if (cur) await db.forays.update(r.foray_id, { name: r.name, endedAt: r.ended_at ?? undefined, shared: { ...cur.shared, ...shared }, joined })
    else await db.forays.add({ id: r.foray_id, name: r.name, startedAt: r.started_at, endedAt: r.ended_at ?? undefined, updatedAt: nowIso(), shared, joined })
  })
  void publishDeviceKey()
  await refreshForay(r.foray_id).catch(() => {})
  return r.foray_id as string
}

/** Member: stop seeing the foray live. Our finds stay in it; the local copy stays on this device. */
export async function leaveForay(forayId: string) {
  const { sb } = await requireSession()
  await rpc(sb, 'leave_foray', { p_foray_id: forayId })
  const db = useDb()
  await db.transaction('rw', db.forays, db.peerFinds, db.comments, async () => {
    await db.forays.update(forayId, { shared: undefined })
    await db.peerFinds.where('forayId').equals(forayId).filter((p) => p.source === 'server').delete()
    await db.comments.where('forayId').equals(forayId).filter((c) => !c.mine).delete()
  })
}

/** Owner or leader: new code (the old one stops working) or turn joining off. */
export async function rotateJoinCode(forayId: string, disable = false): Promise<string | null> {
  const { sb } = await requireSession()
  const code = await rpc<string | null>(sb, 'rotate_foray_code', { p_foray_id: forayId, p_disable: disable })
  await patchShared(forayId, { joinCode: code })
  return code
}

export async function setMemberRole(forayId: string, userId: string, role: 'leader' | 'member') {
  const { sb } = await requireSession()
  await rpc(sb, 'set_foray_role', { p_foray_id: forayId, p_user_id: userId, p_role: role })
  await refreshForay(forayId)
}

/** Pull members, everyone's finds and comments into the local cache. */
export async function refreshForay(forayId: string): Promise<void> {
  const { sb, userId } = await requireSession()
  const [members, feed, comments] = await Promise.all([
    rpc<any[]>(sb, 'foray_member_list', { p_foray_id: forayId }),
    rpc<FeedRow[]>(sb, 'foray_feed', { p_foray_id: forayId }),
    rpc<any[]>(sb, 'foray_comments', { p_foray_id: forayId }),
  ])
  const now = nowIso()
  const db = useDb()
  const mem: ForayMember[] = (members ?? []).map((m) => ({
    userId: m.user_id, displayName: m.display_name || 'A member', role: m.role, leftAt: m.left_at, keys: m.keys ?? [],
  }))
  const myRole = mem.find((m) => m.userId === userId)?.role
  await db.transaction('rw', db.forays, db.peerFinds, db.comments, async () => {
    const f = await db.forays.get(forayId)
    if (f) {
      await db.forays.update(forayId, {
        shared: { ...(f.shared ?? { role: 'member' }), ...(myRole ? { role: myRole } : {}), members: mem, refreshedAt: now,
          ownerName: mem.find((m) => m.role === 'owner')?.displayName ?? f.shared?.ownerName },
      })
    }
    const existing = await db.peerFinds.where('forayId').equals(forayId).toArray()
    const next = mergeFeed(existing, (feed ?? []).map((r) => feedRowToPeerFind(r, forayId, now)), userId)
    // Keep blobs already downloaded for file/mesh finds; server photos load on demand.
    await db.peerFinds.bulkDelete(existing.filter((e) => !next.some((n) => n.id === e.id)).map((e) => e.id))
    await db.peerFinds.bulkPut(next.map((n) => ({ ...existing.find((e) => e.id === n.id && e.source !== 'server'), ...n })))
    // Comments: server copy for everyone's; our own unsynced ones stay as they are.
    const local = await db.comments.where('forayId').equals(forayId).toArray()
    const serverIds = new Set((comments ?? []).map((c) => c.id))
    await db.comments.bulkDelete(local.filter((c) => !serverIds.has(c.id) && (!c.mine || c.syncedAt)).map((c) => c.id))
    await db.comments.bulkPut((comments ?? []).filter((c) => !local.some((l) => l.id === c.id && l.mine && !l.syncedAt)).map((c) => ({
      id: c.id, forayId, specimenRowId: c.specimen_row_id, kind: c.kind, body: c.body ?? '', taxon: c.taxon ?? undefined,
      authorName: c.author_name || 'A member', userId: c.user_id, mine: (c.user_id === userId ? 1 : 0) as 0 | 1,
      createdAt: c.created_at, updatedAt: c.updated_at, syncedAt: c.updated_at,
    })))
  })
}

/** Add a comment, ID suggestion or agreement. Works offline; it syncs like everything else. */
export async function addComment(forayId: string, specimenRowId: string, kind: FindComment['kind'], body: string, taxon?: string) {
  const db = useDb()
  const now = nowIso()
  const row: FindComment = {
    id: newId(), forayId, specimenRowId, kind, body: body.trim().slice(0, 2000), taxon: taxon?.trim().slice(0, 200) || undefined,
    authorName: (await getDisplayName()) || 'You', mine: 1, createdAt: now, updatedAt: now,
  }
  await db.transaction('rw', db.comments, db.outbox, async () => {
    await db.comments.add(row)
    await enqueue('comments', row.id)
  })
  void useSync().syncNow()
  return row
}

export async function deleteComment(id: string) {
  const db = useDb()
  await db.transaction('rw', db.comments, db.outbox, async () => {
    await db.comments.delete(id)
    await enqueue('comments', id, 'delete')
  })
}

/** Short-lived URL for a member's photo (members can read shared photos; see 0006). */
const urlCache = new Map<string, { url: string; until: number }>()
export async function sharedPhotoUrl(storagePath: string): Promise<string | null> {
  const hit = urlCache.get(storagePath)
  if (hit && hit.until > Date.now()) return hit.url
  try {
    const sb = client()
    const { data, error } = await sb.storage.from('foray-media').createSignedUrl(storagePath, 3600)
    if (error || !data?.signedUrl) return null
    urlCache.set(storagePath, { url: data.signedUrl, until: Date.now() + 50 * 60_000 })
    return data.signedUrl
  } catch {
    return null
  }
}

/** Foray screen: keep the shared view fresh while it is open and online. */
export function useSharedForayPolling(forayId: string, isShared: () => boolean) {
  const error = ref('')
  const refreshing = ref(false)
  let timer: ReturnType<typeof setInterval> | null = null
  const run = async () => {
    if (!isShared() || refreshing.value || (typeof navigator !== 'undefined' && !navigator.onLine)) return
    refreshing.value = true
    try {
      await refreshForay(forayId)
      error.value = ''
    } catch (e: any) {
      error.value = e?.message ?? String(e)
    } finally {
      refreshing.value = false
    }
  }
  onMounted(() => {
    void run()
    timer = setInterval(run, POLL_MS)
    window.addEventListener('online', run)
  })
  onBeforeUnmount(() => {
    if (timer) clearInterval(timer)
    window.removeEventListener('online', run)
  })
  return { error, refreshing, refresh: run }
}
