// Runs supabase/migrations/0005_id_sets.sql for real in PGlite (in-process Postgres) against
// minimal Supabase stubs. Not covered: real Supabase roles/grants/RLS enforcement.
import test, { before } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { ID_ALPHABET, checkChar, isValidId, formatId } from '../utils/idCode.ts'

const U1 = '11111111-1111-1111-1111-111111111111'
const U2 = '22222222-2222-2222-2222-222222222222'
const U3 = '33333333-3333-3333-3333-333333333333' // unverified
const DEV = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const DEV2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

let db
const as = (u) => db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [u ?? ''])
const claim = async (u, n = 4, dev = DEV) => { await as(u); return (await db.query('select * from claim_id_sets($1,$2)', [dev, n])).rows }
const rnd = (n) => Array.from({ length: n }, () => ID_ALPHABET[Math.floor(Math.random() * 32)]).join('')
const rejects = (p, re) => assert.rejects(p, (e) => re.test(e.message))
let rowN = 0
const insertSpec = (user, sid) => {
  const id = `00000000-0000-4000-8000-${String(++rowN).padStart(12, '0')}`
  return db.query('insert into public.specimens (id, user_id, specimen_id) values ($1,$2,$3)', [id, user, sid])
}

before(async () => {
  db = new PGlite()
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role anon; create role authenticated;
    create table public.specimens (id uuid primary key, user_id uuid default auth.uid(), specimen_id text not null);
    create unique index specimens_user_specimen_id_key on public.specimens (user_id, specimen_id);
    insert into auth.users values ('${U1}','a@x', now()), ('${U2}','b@x', now()), ('${U3}','c@x', null);
  `)
  await db.exec(readFileSync(new URL('../supabase/migrations/0005_id_sets.sql', import.meta.url), 'utf8'))
})

test('migration is idempotent', async () => {
  await db.exec(readFileSync(new URL('../supabase/migrations/0005_id_sets.sql', import.meta.url), 'utf8'))
})

test('SQL check char equals TS checkChar for 2000 random payloads', async () => {
  for (let i = 0; i < 2000; i++) {
    const p = rnd(8)
    const r = await db.query('select fa_id_check_char($1) c', [p])
    assert.equal(r.rows[0].c, checkChar(p), p)
  }
})

test('SQL fa_id_valid agrees with TS isValidId (valid IDs and single-char mutations)', async () => {
  const classes = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  for (let i = 0; i < 300; i++) {
    const c = i % 4 === 0 ? classes[Math.floor(Math.random() * 32)] : 'ABCDEFGH'[i % 8]
    const body = c + rnd(7)
    const id = body + checkChar(body)
    const cands = [id]
    for (let k = 0; k < 4; k++) {
      const pos = Math.floor(Math.random() * 9)
      cands.push(id.slice(0, pos) + ID_ALPHABET[Math.floor(Math.random() * 32)] + id.slice(pos + 1))
    }
    cands.push(id.slice(0, 8), id + 'A', id.slice(0, 3) + '1' + id.slice(4))
    for (const s of cands) {
      const r = await db.query('select fa_id_valid($1) v', [s])
      assert.equal(r.rows[0].v, isValidId(s), s)
    }
  }
  // formatId output is valid in SQL
  assert.equal((await db.query('select fa_id_valid($1) v', [formatId('B7QM', 5, 42)])).rows[0].v, true)
})

test('b32 helpers round trip', async () => {
  const r = await db.query(`select fa_encode_b32(1023, 2) a, fa_decode_b32('YX') b, fa_decode_b32('0A') c`)
  assert.equal(r.rows[0].a, '99')
  assert.equal(Number(r.rows[0].b), 725)
  assert.equal(Number((await db.query(`select fa_decode_b32(fa_encode_b32(1023,2)) n`)).rows[0].n), 1023)
  assert.equal(r.rows[0].c, null)
  await assert.rejects(db.query('select fa_encode_b32(1024, 2)'))
})

test('network code bijection over the whole space (sampled) and class A-H', async () => {
  const r = await db.query(`select count(distinct fa_network_code(n)) d, bool_and(substr(fa_network_code(n),1,1) between 'A' and 'H') ok
    from generate_series(0, 262143) n`)
  assert.equal(Number(r.rows[0].d), 262144)
  assert.equal(r.rows[0].ok, true)
})

test('unverified and signed-out users are refused', async () => {
  await rejects(claim(U3), /verified email required/)
  await rejects(claim(''), /verified email required/)
})

test('p_count must be 1..16', async () => {
  await rejects(claim(U1, 0), /between 1 and 16/)
  await rejects(claim(U1, 17), /between 1 and 16/)
})

let u1sets = []
test('two users get different networks; repeated claims are sequential and never repeat', async () => {
  const a = await claim(U1, 4)
  const b = await claim(U2, 4)
  assert.equal(a.length, 4)
  assert.notEqual(a[0].network, b[0].network)
  assert.deepEqual(a.map((r) => r.set_no), [0, 1, 2, 3])
  const a2 = await claim(U1, 3, DEV2)
  assert.equal(a2[0].network, a[0].network)
  assert.deepEqual(a2.map((r) => r.set_no), [4, 5, 6])
  u1sets = [...a, ...a2]
  const keys = new Set(u1sets.map((r) => r.network + r.set_no))
  assert.equal(keys.size, 7)
  const own = await db.query(`select count(*)::int n from id_networks where user_id = $1`, [U1])
  assert.equal(own.rows[0].n, 1)
})

test('claiming past 1024 sets spills into a second network (24h limit lifted by backdating)', async () => {
  await db.exec(`update id_sets set claimed_at = now() - interval '2 days'`)
  // user 1 has 7 sets; claim 1017 more in 16-set calls, backdating as we go
  let got = []
  let need = 1024 - 7 - 8 // leave 8 free
  while (need > 0) {
    const n = Math.min(16, need)
    got.push(...(await claim(U1, n)))
    need -= n
    await db.exec(`update id_sets set claimed_at = now() - interval '2 days'`)
  }
  const span = await claim(U1, 16) // 8 left in network 1, 8 in network 2
  assert.equal(span.length, 16)
  const nets = [...new Set(span.map((r) => r.network))]
  assert.equal(nets.length, 2)
  assert.deepEqual(span.slice(0, 8).map((r) => r.set_no), [1016, 1017, 1018, 1019, 1020, 1021, 1022, 1023])
  assert.deepEqual(span.slice(8).map((r) => r.set_no), [0, 1, 2, 3, 4, 5, 6, 7])
  const dup = await db.query(`select count(*)::int n from (select network, set_no from id_sets group by 1,2 having count(*)>1) t`)
  assert.equal(dup.rows[0].n, 0)
  const nn = await db.query(`select count(*)::int n from id_networks where user_id=$1`, [U1])
  assert.equal(nn.rows[0].n, 2)
})

test('rate limit: 64 sets per rolling 24h', async () => {
  await db.exec(`update id_sets set claimed_at = now() - interval '2 days'`)
  for (let i = 0; i < 4; i++) await claim(U2, 16)
  await rejects(claim(U2, 1), /id set claim limit reached/)
  // 24h later it works again
  await db.exec(`update id_sets set claimed_at = now() - interval '25 hours' where user_id = '${U2}'`)
  assert.equal((await claim(U2, 1)).length, 1)
})

test('trigger: accepts pending and own IDs; rejects foreign, bad check, unissued, non-personal', async () => {
  await db.exec(`update id_sets set claimed_at = now() - interval '2 days'`)
  const [mine] = await claim(U1, 1)
  await as(U1)
  const own = formatId(mine.network, mine.set_no, 5)
  await insertSpec(U1, '')
  await insertSpec(U1, '')
  await insertSpec(U1, own)
  // foreign user's ID
  await rejects(insertSpec(U2, own), /not issued to this account/)
  // bad check char
  const bad = own.slice(0, 8) + ID_ALPHABET[(ID_ALPHABET.indexOf(own[8]) + 1) % 32]
  await rejects(insertSpec(U1, bad), /not valid/)
  // valid shape but unissued set (set 1023 of a fresh network not owned)
  const u2net = (await db.query(`select code from id_networks where user_id=$1 limit 1`, [U2])).rows[0].code
  await rejects(insertSpec(U1, formatId(u2net, 0, 0)), /not issued to this account/)
  await rejects(insertSpec(U1, formatId(mine.network, 1023, 0)), /not issued to this account/)
  // non-personal class
  await rejects(insertSpec(U1, formatId('U2KD', 3, 7)), /class A-H/)
  // update path
  await db.query(`update public.specimens set specimen_id = $1 where specimen_id = ''  and id = (select id from public.specimens where specimen_id = '' limit 1)`, [formatId(mine.network, mine.set_no, 6)])
  await rejects(db.query(`update public.specimens set specimen_id = $1 where specimen_id = '' and id = (select id from public.specimens where specimen_id = '' limit 1)`, [formatId(u2net, 0, 0)]), /not issued/)
})

test('global unique index: duplicate rejected across users and rows, many empties allowed', async () => {
  const [mine] = (await db.query(`select network, set_no from id_sets where user_id=$1 limit 1`, [U1])).rows
  const id = formatId(mine.network, mine.set_no, 77)
  await insertSpec(U1, id)
  await assert.rejects(insertSpec(U1, id), /duplicate key|unique/)
  for (let i = 0; i < 5; i++) await insertSpec(U1, '')
  for (let i = 0; i < 3; i++) await insertSpec(U2, '')
  const idx = await db.query(`select indexname from pg_indexes where tablename='specimens'`)
  assert.ok(!idx.rows.some((r) => r.indexname === 'specimens_user_specimen_id_key'))
})

test('verify_ids reports problems and returns nothing for good ids', async () => {
  const [mine] = (await db.query(`select network, set_no from id_sets where user_id=$1 limit 1`, [U1])).rows
  const good = formatId(mine.network, mine.set_no, 1)
  const u2net = (await db.query(`select code from id_networks where user_id=$1 limit 1`, [U2])).rows[0].code
  const foreign = formatId(u2net, 0, 0)
  const badCheck = good.slice(0, 8) + ID_ALPHABET[(ID_ALPHABET.indexOf(good[8]) + 1) % 32]
  await as(U1)
  const r = await db.query('select * from verify_ids($1)', [[good, '', foreign, badCheck, 'SHORT', 'B7QM4T9R!']])
  const m = Object.fromEntries(r.rows.map((x) => [x.id, x.problem]))
  assert.equal(m[good], undefined)
  assert.equal(m[foreign], 'not issued to you')
  assert.equal(m[badCheck], 'bad check character')
  assert.equal(m['SHORT'], 'bad format')
  assert.equal(m['B7QM4T9R!'], 'bad format')
  assert.equal(r.rows.length, 4)
  assert.equal((await db.query('select * from verify_ids($1)', [[]])).rows.length, 0)
  await as('')
  await rejects(db.query('select * from verify_ids($1)', [[good]]), /sign in required/)
})
