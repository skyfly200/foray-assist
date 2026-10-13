// Runs supabase/migrations 0001-0006 for real in PGlite (in-process Postgres) against minimal
// Supabase stubs, then checks shared forays, comments, societies and vouchers. Queries run
// as the `authenticated` role, so row-level security and grants are enforced like on Supabase.
// Not covered: PostgREST, Supabase Storage itself, Realtime.
import test, { before } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { formatId, isValidId } from '../utils/idCode.ts'

const OWNER = '11111111-1111-1111-1111-111111111111'
const AMY = '22222222-2222-2222-2222-222222222222'
const EVE = '33333333-3333-3333-3333-333333333333' // verified, never joins
const UNV = '44444444-4444-4444-4444-444444444444' // unverified email
const DEV = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const FORAY = 'f0000000-0000-4000-8000-000000000001'
const OTHER_FORAY = 'f0000000-0000-4000-8000-000000000002'

let db
const mig = (n) => readFileSync(new URL(`../supabase/migrations/${n}`, import.meta.url), 'utf8')
let rowN = 0
const uid = () => `00000000-0000-4000-8000-${String(++rowN).padStart(12, '0')}`

/** Run SQL as a signed-in user (role authenticated) in its own transaction. */
async function as(user, sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [user ?? ''])
    await tx.query('set local role authenticated')
    return (await tx.query(sql, params)).rows
  })
}
const rejects = (p, re) => assert.rejects(p, (e) => re.test(e.message))

before(async () => {
  db = new PGlite()
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role anon; create role authenticated;
    grant usage on schema auth to anon, authenticated;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean);
    create table storage.objects (id serial primary key, bucket_id text, name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
    grant usage on schema storage to authenticated;
    grant select on storage.objects to authenticated;
    insert into auth.users values
      ('${OWNER}','owner@x', now()), ('${AMY}','amy@x', now()), ('${EVE}','eve@x', now()), ('${UNV}','unv@x', null);
  `)
  for (const f of ['0001_init.sql', '0002_sync_schema.sql', '0003_integrations.sql', '0004_unique_specimen_id.sql', '0005_id_sets.sql', '0006_shared_forays.sql']) {
    await db.exec(mig(f))
  }
  // Supabase's default grants on public tables.
  await db.exec(`
    grant usage on schema public to anon, authenticated;
    grant select, insert, update, delete on public.forays, public.specimens, public.photos, public.voice_notes to authenticated;
  `)
})

/** Insert a specimen owned by `user` (bypasses the ID guard by leaving the ID pending). */
async function addFind(user, forayId, geoprivacy, lat = 39.7392, lon = -104.9903, notes = {}) {
  const id = uid()
  await as(user, `insert into public.specimens (id, specimen_id, foray_id, "timestamp", latitude, longitude, geoprivacy, field_notes, updated_at)
                  values ($1, '', $2, now(), $3, $4, $5, $6, now())`, [id, forayId, lat, lon, geoprivacy, JSON.stringify(notes)])
  return id
}

let code = ''

test('migration 0006 is idempotent', async () => {
  await db.exec(mig('0006_shared_forays.sql'))
})

test('sharing needs a verified email', async () => {
  await rejects(as(UNV, 'select * from share_foray($1, $2, now(), $3)', [uid(), 'X', 'U']), /verified email required/)
  await rejects(as(null, 'select * from share_foray($1, $2, now(), $3)', [uid(), 'X', 'U']), /verified email required/)
})

test('owner shares an unsynced foray and gets a join code and mesh key', async () => {
  const [r] = await as(OWNER, 'select * from share_foray($1, $2, now(), $3)', [FORAY, 'Golden Gate', 'Skyler'])
  assert.match(r.join_code, /^[A-HJ-NP-Z2-9]{8}$/)
  assert.ok(r.mesh_key.length >= 40)
  code = r.join_code
  // Sharing again keeps the same code.
  const [again] = await as(OWNER, 'select * from share_foray($1, $2, now(), $3)', [FORAY, 'Golden Gate', 'Skyler'])
  assert.equal(again.join_code, code)
})

test("owner's sync upsert cannot change join code, society or mesh key", async () => {
  await as(OWNER, `insert into public.forays (id, name, started_at, updated_at, join_code, society_id, mesh_key)
                   values ($1, 'Renamed', now(), now(), 'AAAAAAAA', gen_random_uuid(), 'x')
                   on conflict (id) do update set name = excluded.name, join_code = excluded.join_code,
                     society_id = excluded.society_id, mesh_key = excluded.mesh_key`, [FORAY])
  const [f] = await db.query('select name, join_code, society_id from public.forays where id = $1', [FORAY]).then((r) => r.rows)
  assert.equal(f.name, 'Renamed')
  assert.equal(f.join_code, code)
  assert.equal(f.society_id, null)
  // A new foray can't be created with a code either.
  const fid = uid()
  await as(OWNER, `insert into public.forays (id, name, started_at, updated_at, join_code) values ($1, 'x', now(), now(), 'BBBBBBBB')`, [fid])
  assert.equal((await db.query('select join_code from public.forays where id = $1', [fid])).rows[0].join_code, null)
})

test('only the owner can share; strangers see nothing', async () => {
  await rejects(as(AMY, 'select * from share_foray($1, $2, now(), $3)', [FORAY, 'Mine now', 'Amy']), /only the person who started/)
  assert.equal((await as(EVE, 'select * from public.forays where id = $1', [FORAY])).length, 0)
  await rejects(as(EVE, 'select * from foray_feed($1)', [FORAY]), /not a member/)
  await rejects(as(EVE, 'select * from foray_member_list($1)', [FORAY]), /not a member/)
})

test('join with a code (case, dash and spaces ignored)', async () => {
  await rejects(as(AMY, 'select * from join_foray($1, $2)', ['ZZZZZZZZ', 'Amy']), /join code not found/)
  const typed = ` ${code.slice(0, 4).toLowerCase()}-${code.slice(4)} `
  const [r] = await as(AMY, 'select * from join_foray($1, $2)', [typed, 'Amy'])
  assert.equal(r.foray_id, FORAY)
  assert.equal(r.role, 'member')
  assert.equal(r.owner_name, 'Skyler')
  assert.ok(r.mesh_key)
  // Members can read the foray row and the member list.
  assert.equal((await as(AMY, 'select id from public.forays where id = $1', [FORAY])).length, 1)
  const members = await as(AMY, 'select * from foray_member_list($1)', [FORAY])
  assert.deepEqual(members.map((m) => [m.display_name, m.role]), [['Skyler', 'owner'], ['Amy', 'member']])
})

test("a member can't update or delete the owner's foray row", async () => {
  await as(AMY, `update public.forays set name = 'hacked' where id = $1`, [FORAY])
  await as(AMY, `delete from public.forays where id = $1`, [FORAY])
  const r = await db.query('select name from public.forays where id = $1', [FORAY])
  assert.equal(r.rows[0].name, 'Renamed')
})

test('feed applies each find’s location setting and hides private photos', async () => {
  const open = await addFind(OWNER, FORAY, 'open', 39.7392, -104.9903, { speciesGuess: 'Amanita muscaria' })
  const obsc = await addFind(OWNER, FORAY, 'obscured', 39.7392, -104.9903)
  const priv = await addFind(AMY, FORAY, 'private', 39.7392, -104.9903)
  for (const [s, u] of [[open, OWNER], [priv, AMY]]) {
    await db.query(`insert into public.photos (id, user_id, specimen_row_id, foray_id, source, mime_type, captured_at, updated_at, storage_path)
                    values ($1, $2, $3, $4, 'capture', 'image/jpeg', now(), now(), $5)`, [uid(), u, s, FORAY, `x/photos/${s}`])
  }
  const feed = await as(AMY, 'select * from foray_feed($1)', [FORAY])
  const byId = Object.fromEntries(feed.map((r) => [r.id, r]))
  assert.equal(byId[open].latitude, 39.7392)
  assert.equal(byId[open].author_name, 'Skyler')
  assert.equal(byId[open].field_notes.speciesGuess, 'Amanita muscaria')
  assert.equal(byId[open].photos.length, 1)
  assert.ok(Math.abs(byId[obsc].latitude - 39.7) < 1e-9, String(byId[obsc].latitude))
  assert.ok(Math.abs(byId[obsc].longitude - -104.9) < 1e-9, String(byId[obsc].longitude))
  assert.equal(byId[priv].latitude, null)
  assert.equal(byId[priv].longitude, null)
  assert.deepEqual(byId[priv].photos, [])
  // Specimens RLS is still owner-only: Amy can't read the exact location directly.
  assert.equal((await as(AMY, 'select * from public.specimens where id = $1', [obsc])).length, 0)
})

test('storage: members read shared photos, not private ones; strangers read none', async () => {
  const feed = await as(AMY, 'select * from foray_feed($1)', [FORAY])
  const path = feed.find((r) => r.photos.length).photos[0].storage_path
  const priv = feed.find((r) => r.geoprivacy === 'private')
  await db.query(`insert into storage.objects (bucket_id, name) values ('foray-media', $1), ('foray-media', $2)`, [path, `x/photos/${priv.id}`])
  const amySees = await as(AMY, `select name from storage.objects`)
  assert.deepEqual(amySees.map((r) => r.name), [path])
  assert.equal((await as(EVE, `select name from storage.objects`)).length, 0)
})

test("a non-member can't inject finds into the feed by foray id", async () => {
  await addFind(EVE, FORAY, 'open')
  const feed = await as(AMY, 'select * from foray_feed($1)', [FORAY])
  assert.ok(feed.every((r) => r.user_id !== EVE))
})

test('comments: members comment and suggest; strangers cannot', async () => {
  const [target] = await as(AMY, 'select id from foray_feed($1) where user_id = $2 limit 1', [FORAY, OWNER])
  await as(AMY, `insert into public.find_comments (id, foray_id, specimen_row_id, kind, body, taxon, updated_at)
                 values ($1, $2, $3, 'suggestion', 'Looks like fly agaric', 'Amanita muscaria', now())`, [uid(), FORAY, target.id])
  await rejects(as(EVE, `insert into public.find_comments (id, foray_id, specimen_row_id, body, updated_at)
                         values ($1, $2, $3, 'hi', now())`, [uid(), FORAY, target.id]), /row-level security/)
  // A comment must point at a find in the same foray.
  const elsewhere = await addFind(AMY, OTHER_FORAY, 'open')
  await rejects(as(AMY, `insert into public.find_comments (id, foray_id, specimen_row_id, body, updated_at)
                         values ($1, $2, $3, 'x', now())`, [uid(), FORAY, elsewhere]), /row-level security/)
  const list = await as(OWNER, 'select * from foray_comments($1)', [FORAY])
  assert.equal(list.length, 1)
  assert.equal(list[0].author_name, 'Amy')
  assert.equal(list[0].kind, 'suggestion')
  // Nobody edits another person's comment.
  await as(OWNER, `update public.find_comments set body = 'changed'`)
  assert.equal((await db.query('select body from public.find_comments')).rows[0].body, 'Looks like fly agaric')
})

test('leaving keeps past finds but removes access; the owner cannot leave', async () => {
  await rejects(as(OWNER, 'select leave_foray($1)', [FORAY]), /cannot leave/)
  await as(AMY, 'select leave_foray($1)', [FORAY])
  await rejects(as(AMY, 'select * from foray_feed($1)', [FORAY]), /not a member/)
  assert.equal((await as(AMY, 'select id from public.forays where id = $1', [FORAY])).length, 0)
  const feed = await as(OWNER, 'select * from foray_feed($1)', [FORAY])
  assert.ok(feed.some((r) => r.user_id === AMY), "Amy's past find stays in the foray")
  // Rejoining with the code restores access.
  await as(AMY, 'select * from join_foray($1, $2)', [code, ''])
  assert.ok((await as(AMY, 'select * from foray_feed($1)', [FORAY])).length > 0)
  const amy = (await as(AMY, 'select * from foray_member_list($1)', [FORAY])).find((m) => m.user_id === AMY)
  assert.equal(amy.display_name, 'Amy', 'an empty name on rejoin keeps the old one')
})

test('rotating the code retires the old one; members can’t rotate', async () => {
  await rejects(as(AMY, 'select rotate_foray_code($1)', [FORAY]), /only the foray owner or a leader/)
  const [{ rotate_foray_code: next }] = await as(OWNER, 'select rotate_foray_code($1)', [FORAY])
  assert.notEqual(next, code)
  await rejects(as(EVE, 'select * from join_foray($1, $2)', [code, 'Eve']), /join code not found/)
  await as(OWNER, 'select set_foray_role($1, $2, $3)', [FORAY, AMY, 'leader'])
  await as(AMY, 'select rotate_foray_code($1, true)', [FORAY])
  assert.equal((await db.query('select join_code from public.forays where id = $1', [FORAY])).rows[0].join_code, null)
})

test('device keys: owner writes, co-members read through the member list', async () => {
  const key = 'B' + 'A'.repeat(86) + '='
  await as(OWNER, `insert into public.device_keys (device_id, key_id, public_key) values ($1, 'deadbeef', $2)`, [DEV, key])
  await rejects(as(AMY, `insert into public.device_keys (user_id, device_id, key_id, public_key) values ($1, $2, 'deadbeef', $3)`, [OWNER, uid(), key]), /row-level security/)
  assert.equal((await as(AMY, 'select * from public.device_keys')).length, 0)
  const owner = (await as(AMY, 'select * from foray_member_list($1)', [FORAY])).find((m) => m.user_id === OWNER)
  assert.deepEqual(owner.keys, [{ device_id: DEV, key_id: 'deadbeef', public_key: key }])
})

test('society networks are U-Z, distinct, and a bijection', async () => {
  const r = await db.query(`select count(distinct fa_society_network_code(n)) c, min(left(fa_society_network_code(n),1)) lo,
                                   max(left(fa_society_network_code(n),1)) hi from generate_series(0, 196607) n`)
  assert.equal(Number(r.rows[0].c), 196608)
  assert.equal(r.rows[0].lo, 'U')
  assert.equal(r.rows[0].hi, 'Z')
})

test('societies: admin creates, members join, officers and leaders claim vouchers', async () => {
  await rejects(as(OWNER, `select create_society('frms', 'Front Range Mycological Society')`), /permission denied/)
  const frms = (await db.query(`select create_society('frms', 'Front Range Mycological Society', 'owner@x') id`)).rows[0].id
  const cms = (await db.query(`select create_society('cms', 'Colorado Mycological Society') id`)).rows[0].id
  const [mine] = await as(OWNER, 'select * from my_societies()')
  assert.equal(mine.slug, 'frms')
  assert.equal(mine.role, 'officer')
  assert.match(mine.network, /^[U-Z]/)
  // Strangers can't see the society.
  assert.equal((await as(EVE, 'select * from public.societies')).length, 0)
  // Amy joins with the code and can't claim; the officer can.
  const [joined] = await as(AMY, 'select * from join_society($1, $2)', [mine.join_code, 'Amy'])
  assert.equal(joined.role, 'member')
  assert.equal((await as(AMY, 'select * from my_societies()'))[0].join_code, null, 'members do not see the code')
  await rejects(as(AMY, 'select * from claim_society_sets($1, $2, 1)', [frms, DEV]), /only society officers and leaders/)
  const sets = await as(OWNER, 'select * from claim_society_sets($1, $2, 2)', [frms, DEV])
  assert.deepEqual(sets.map((s) => s.set_no), [0, 1])
  // Vouchers: valid, issued to a society the author belongs to.
  const voucher = formatId(mine.network, 1, 7)
  assert.ok(isValidId(voucher))
  const find = await addFind(AMY, FORAY, 'open')
  await as(AMY, 'update public.specimens set voucher_id = $1 where id = $2', [voucher, find])
  await rejects(as(AMY, 'update public.specimens set voucher_id = $1 where id = $2', [voucher.slice(0, 8) + (voucher[8] === 'A' ? 'B' : 'A'), find]), /not a valid society number/)
  const eveFind = await addFind(EVE, OTHER_FORAY, 'open')
  await rejects(as(EVE, 'update public.specimens set voucher_id = $1 where id = $2', [formatId(mine.network, 0, 1), eveFind]), /not issued to a society you belong to/)
  const unclaimed = formatId(mine.network, 5, 0)
  await rejects(as(AMY, 'update public.specimens set voucher_id = $1 where id = $2', [unclaimed, find]), /not issued/)
  // Society forays: only officers/leaders can run one; members list it.
  const sf = uid()
  await rejects(as(AMY, 'select * from share_foray($1, $2, now(), $3, $4)', [sf, 'x', 'Amy', frms]), /only society officers and leaders/)
  const [shared] = await as(OWNER, 'select * from share_foray($1, $2, now(), $3, $4)', [sf, 'FRMS Fall Foray', 'Skyler', frms])
  assert.equal(shared.society_name, 'Front Range Mycological Society')
  const listed = await as(AMY, 'select * from society_forays($1)', [frms])
  assert.equal(listed[0].join_code, shared.join_code)
  await rejects(as(AMY, 'select * from society_forays($1)', [cms]), /not a member of this society/)
})
