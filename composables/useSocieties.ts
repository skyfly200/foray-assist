// Societies such as FRMS and CMS (roadmap Phase 12): membership, society forays and voucher
// numbers. A society is created by the project admin (create_society in SQL, see SETUP.md);
// people join with the society's code. Officers and leaders claim sets of voucher numbers in
// the society network (U-Z class) for preprinted sheets; members record a voucher number on
// their own finds. Memberships are cached so the voucher field works offline.
import { formatId, isValidId, normalizeId, parseId, SET_SIZE } from '~/utils/idCode'
import { normalizeJoinCode } from '~/utils/sharing'

export interface Society {
  society_id: string
  slug: string
  name: string
  network: string
  role: 'officer' | 'leader' | 'member'
  join_code: string | null
}

export interface SocietySet { societyId: string; network: string; set: number; claimedAt: string }

const societies = ref<Society[]>([])
const loaded = ref(false)

async function session() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error("You're offline. This needs a connection.")
  const cfg: any = useRuntimeConfig().public
  if (!cfg?.syncConfigured) throw new Error('Societies need the app to be connected to Supabase (see SETUP.md).')
  const sb = useSupabaseClient()
  const { data } = await sb.auth.getSession()
  if (!data.session) throw new Error('Sign in first.')
  return sb as any
}

function friendly(msg: string) {
  if (/society code not found/i.test(msg)) return "That code didn't match a society. Ask an officer for the current code."
  if (/verified email required/i.test(msg)) return 'Confirm your email (sign in above) first.'
  if (/function .* does not exist|schema cache/i.test(msg)) return 'The server is missing the societies update (migration 0006, see SETUP.md).'
  return msg
}

async function loadCached() {
  if (loaded.value) return
  societies.value = ((await useDb().settings.get('societies'))?.value as Society[] | undefined) ?? []
  loaded.value = true
}

async function refresh(): Promise<void> {
  const sb = await session()
  const { data, error } = await sb.rpc('my_societies')
  if (error) throw new Error(friendly(error.message))
  societies.value = data ?? []
  loaded.value = true
  await useDb().settings.put({ key: 'societies', value: JSON.parse(JSON.stringify(societies.value)) })
}

async function join(code: string, displayName: string): Promise<Society> {
  const c = normalizeJoinCode(code)
  if (!c) throw new Error('A society code is 8 letters and numbers, like ABCD-EFGH.')
  const sb = await session()
  const { data, error } = await sb.rpc('join_society', { p_code: c, p_display_name: displayName })
  if (error) throw new Error(friendly(error.message))
  await refresh()
  return societies.value.find((s) => s.society_id === data?.[0]?.society_id)!
}

async function forays(societyId: string) {
  const sb = await session()
  const { data, error } = await sb.rpc('society_forays', { p_society_id: societyId })
  if (error) throw new Error(friendly(error.message))
  return (data ?? []) as Array<{ foray_id: string; name: string; started_at: string; ended_at: string | null; join_code: string }>
}

async function deviceId(): Promise<string> {
  const db = useDb()
  const v = (await db.settings.get('deviceId'))?.value as string | undefined
  if (v) return v
  const id = crypto.randomUUID()
  await db.settings.put({ key: 'deviceId', value: id })
  return id
}

/** Officers and leaders: claim sets of voucher numbers (1,024 each) for printing. */
async function claimVoucherSets(societyId: string, count = 1): Promise<SocietySet[]> {
  const sb = await session()
  const { data, error } = await sb.rpc('claim_society_sets', { p_society_id: societyId, p_device_id: await deviceId(), p_count: count })
  if (error) throw new Error(friendly(error.message))
  const now = nowIso()
  const sets: SocietySet[] = (data ?? []).map((r: any) => ({ societyId, network: r.network, set: r.set_no, claimedAt: now }))
  const db = useDb()
  const cur = ((await db.settings.get('societySets'))?.value as SocietySet[] | undefined) ?? []
  await db.settings.put({ key: 'societySets', value: [...cur, ...sets] })
  return sets
}

async function claimedSets(): Promise<SocietySet[]> {
  return ((await useDb().settings.get('societySets'))?.value as SocietySet[] | undefined) ?? []
}

/** First and last voucher number of a set, for printing a sheet. */
function setRange(s: { network: string; set: number }) {
  return { first: formatId(s.network, s.set, 0), last: formatId(s.network, s.set, SET_SIZE - 1) }
}

/**
 * Check a typed voucher number before saving it (the server checks again): valid, society
 * class, and from a society this person belongs to. Returns '' when fine.
 */
function voucherProblem(input: string): string {
  const id = normalizeId(input)
  if (!id) return 'Use letters and numbers only.'
  if (!/^[U-Z]/.test(id)) return 'Society voucher numbers start with U to Z.'
  if (!isValidId(id)) return 'That number has a typo (the last character does not match).'
  const p = parseId(id)!
  if (!societies.value.some((s) => s.network === p.network)) return "That number belongs to a society you haven't joined on this device."
  return ''
}

/** Save (or clear) a voucher number on one of our own finds. */
async function setVoucher(specimenRowId: string, input: string) {
  const id = input.trim() ? normalizeId(input) : null
  if (id && voucherProblem(id)) throw new Error(voucherProblem(id))
  const db = useDb()
  await db.transaction('rw', db.specimens, db.outbox, async () => {
    // null (not undefined) so clearing it also clears the server copy.
    await db.specimens.update(specimenRowId, { voucherId: (id ?? null) as any, updatedAt: nowIso() })
    await enqueue('specimens', specimenRowId)
  })
}

export function useSocieties() {
  void loadCached()
  return { societies, refresh, join, forays, claimVoucherSets, claimedSets, setRange, voucherProblem, setVoucher }
}
