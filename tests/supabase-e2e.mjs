// End-to-end check of the ID v2 server side (supabase/migrations/0005) against a real Supabase
// stack: GoTrue sign-in, PostgREST RPCs, RLS, grants, and the specimens trigger, using the same
// upsert the sync engine sends. Creates throwaway users, so point it at a local stack only:
//   npx supabase init && copy supabase/migrations/*.sql in, renamed <timestamp>_<name>.sql
//   npx supabase start            # prints API_URL, ANON_KEY, SERVICE_ROLE_KEY
//   SUPABASE_URL=... SUPABASE_KEY=<anon> SUPABASE_SERVICE_KEY=<service> node tests/supabase-e2e.mjs
import { createClient } from '@supabase/supabase-js'
import { formatId, isValidId } from '../utils/idCode.ts'
const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const ANON = process.env.SUPABASE_KEY, SERVICE = process.env.SUPABASE_SERVICE_KEY
if (!ANON || !SERVICE) { console.error('Set SUPABASE_KEY (anon) and SUPABASE_SERVICE_KEY (service role).'); process.exit(2) }
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })
const results = []
const ok = (name, cond, extra = '') => { results.push([cond ? 'PASS' : 'FAIL', name, extra]); }
const stamp = Date.now()
async function user(tag, confirm = true) {
  const email = `${tag}${stamp}@example.com`, password = 'pw-123456-abc'
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: confirm })
  if (error) throw error
  const c = createClient(URL, ANON, { auth: { persistSession: false } })
  const s = await c.auth.signInWithPassword({ email, password })
  return { c, id: data.user.id, signInError: s.error?.message }
}
const dev = () => crypto.randomUUID()
const spec = (sid) => ({ id: crypto.randomUUID(), specimen_id: sid, foray_id: crypto.randomUUID(), timestamp: new Date().toISOString(), updated_at: new Date().toISOString(), field_notes: {}, synced_at: new Date().toISOString() })

const A = await user('a'), B = await user('b')
const dA = dev()
const r1 = await A.c.rpc('claim_id_sets', { p_device_id: dA, p_count: 4 })
ok('claim 4 sets as verified user', !r1.error && r1.data.length === 4, JSON.stringify(r1.error ?? r1.data))
const netA = r1.data?.[0]?.network
ok('one network, sets 0..3', r1.data?.every((r, i) => r.network === netA && r.set_no === i))
ok('network is class A-H, 4 chars', /^[A-H][A-Z2-9]{3}$/.test(netA ?? ''), netA)
const r2 = await A.c.rpc('claim_id_sets', { p_device_id: dev(), p_count: 2 })
ok('second device continues same network at set 4', r2.data?.[0]?.network === netA && r2.data?.[0]?.set_no === 4, JSON.stringify(r2.data))
const rB = await B.c.rpc('claim_id_sets', { p_device_id: dev(), p_count: 1 })
const netB = rB.data?.[0]?.network
ok('other user gets a different network', netB && netB !== netA, netB)

const idA = formatId(netA, 2, 17)
ok('client formatId produces valid 9-char ID', isValidId(idA) && idA.length === 9, idA)
const up1 = await A.c.from('specimens').upsert(spec(idA), { onConflict: 'id' })
ok('sync upsert with issued ID accepted', !up1.error, up1.error?.message)
const s1 = spec(idA)
const dup = await A.c.from('specimens').upsert(s1, { onConflict: 'id' })
ok('same ID on a second row rejected (global unique)', !!dup.error, dup.error?.message)
const p1 = await A.c.from('specimens').upsert(spec(''), { onConflict: 'id' })
const p2 = await A.c.from('specimens').upsert(spec(''), { onConflict: 'id' })
ok('two pending ("") specimens accepted', !p1.error && !p2.error, (p1.error ?? p2.error)?.message)
const steal = await A.c.from('specimens').upsert(spec(formatId(netB, 0, 1)), { onConflict: 'id' })
ok('ID from another user network rejected', /not issued/.test(steal.error?.message ?? ''), steal.error?.message)
const unissuedSet = await A.c.from('specimens').upsert(spec(formatId(netA, 99, 1)), { onConflict: 'id' })
ok('ID from unclaimed set rejected', /not issued/.test(unissuedSet.error?.message ?? ''), unissuedSet.error?.message)
const bad = idA.slice(0, 8) + (idA[8] === 'A' ? 'B' : 'A')
const badck = await A.c.from('specimens').upsert(spec(bad), { onConflict: 'id' })
ok('bad check char rejected', /not valid/.test(badck.error?.message ?? ''), badck.error?.message)

// pending -> numbered later (update of specimen_id)
const pend = spec(''); await A.c.from('specimens').upsert(pend, { onConflict: 'id' })
const num = await A.c.from('specimens').upsert({ ...pend, specimen_id: formatId(netA, 0, 5) }, { onConflict: 'id' })
ok('pending find later numbered via upsert', !num.error, num.error?.message)

const v = await A.c.rpc('verify_ids', { p_ids: [idA, bad, formatId(netB, 0, 1), 'XYZ', ''] })
const vm = Object.fromEntries((v.data ?? []).map((r) => [r.id, r.problem]))
ok('verify_ids: own ID clean', !v.error && !(idA in vm), JSON.stringify(v.error ?? v.data))
ok('verify_ids: bad check flagged', vm[bad] === 'bad check character')
ok('verify_ids: foreign ID flagged', vm[formatId(netB, 0, 1)] === 'not issued to you')
ok('verify_ids: junk flagged', vm['XYZ'] === 'bad format')

const nets = await A.c.from('id_networks').select('code')
ok('RLS: user sees only own networks', !nets.error && nets.data.length === 1 && nets.data[0].code === netA, JSON.stringify(nets.data ?? nets.error))
const ins = await A.c.from('id_sets').insert({ network: netA, set_no: 500, device_id: dA, user_id: A.id })
ok('direct insert into id_sets denied', !!ins.error, ins.error?.message)
const insN = await A.c.from('id_networks').insert({ code: 'AAAA', user_id: A.id })
ok('direct insert into id_networks denied', !!insN.error, insN.error?.message)

const anon = createClient(URL, ANON, { auth: { persistSession: false } })
const ra = await anon.rpc('claim_id_sets', { p_device_id: dev(), p_count: 1 })
ok('anon cannot claim', !!ra.error, ra.error?.message)
const U = await user('u', false)
const ru = await U.c.rpc('claim_id_sets', { p_device_id: dev(), p_count: 1 })
ok('unverified email cannot claim', !!ru.error, `signIn: ${U.signInError ?? 'ok'}; rpc: ${ru.error?.message}`)
const big = await A.c.rpc('claim_id_sets', { p_device_id: dev(), p_count: 17 })
ok('count > 16 rejected', !!big.error, big.error?.message)

// daily cap 64
const C = await user('c'); let capErr
for (let i = 0; i < 5; i++) { const r = await C.c.rpc('claim_id_sets', { p_device_id: dev(), p_count: 16 }); if (r.error) { capErr = r.error.message; ok('daily cap hit after 64 sets', i === 4, `i=${i} ${capErr}`); break } }

// concurrent claims from one user: no duplicate sets
const D = await user('d')
const par = await Promise.all(Array.from({ length: 8 }, () => D.c.rpc('claim_id_sets', { p_device_id: dev(), p_count: 2 })))
const all = par.flatMap((r) => r.data ?? []).map((r) => `${r.network}/${r.set_no}`)
ok('8 parallel claims: 16 distinct sets', new Set(all).size === 16 && par.every((r) => !r.error), JSON.stringify(par.map((r) => r.error?.message).filter(Boolean)))

for (const r of results) console.log(r.join(' | '))
const failed = results.filter((r) => r[0] === 'FAIL').length
console.log(failed, 'failures of', results.length)
process.exit(failed ? 1 : 0)
