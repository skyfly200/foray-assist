// Two devices, one account: a find made on device A must show up on device B.
// Needs a local Supabase stack (`npx supabase start`) and a production build
// pointed at it:
//   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_KEY=<anon> npm run build
//   SUPABASE_URL=... SUPABASE_KEY=<anon> SUPABASE_SERVICE_KEY=<service_role> node tests/sync-devices.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'

const { SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_KEY } = process.env
if (!SUPABASE_URL || !SUPABASE_KEY || !SUPABASE_SERVICE_KEY) throw new Error('set SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_KEY')
const PORT = 4174
const APP = `http://localhost:${PORT}`
const COOKIE = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`

const server = spawn('node', ['.output/server/index.mjs'], { stdio: 'ignore', env: { ...process.env, PORT: String(PORT), NITRO_PORT: String(PORT) } })
let browser
const done = async (code) => { await browser?.close(); server.kill(); process.exit(code) }
const fail = (msg) => { console.error('FAIL:', msg); server.kill(); process.exit(1) }
const ok = (msg) => console.log('ok -', msg)

async function api(path, init = {}, key = SUPABASE_SERVICE_KEY) {
  const res = await fetch(SUPABASE_URL + path, { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init.headers } })
  const body = await res.text()
  if (!res.ok) throw new Error(`${path}: ${res.status} ${body}`)
  return body ? JSON.parse(body) : null
}

// One account, signed in on two browsers.
const email = `sync-${Date.now()}@example.com`
const password = 'sync-test-password-1'
await api('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password, email_confirm: true }) })
const session = await api('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) }, SUPABASE_KEY)
const userId = session.user.id
const encoded = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url')
const chunks = encoded.match(/.{1,3180}/g)

await new Promise((r) => setTimeout(r, 3000))
browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
async function device() {
  const ctx = await browser.newContext()
  await ctx.addCookies(chunks.map((value, i) => ({ name: chunks.length === 1 ? COOKIE : `${COOKIE}.${i}`, value, url: APP })))
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.error('pageerror:', e.message))
  await page.goto(APP)
  return page
}

// Raw IndexedDB access (Dexie is not exposed on window).
const idb = (page, fn, arg) => page.evaluate(async ([src, a]) => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('forray-assist'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  try { return await new Function('db', 'req', 'a', `return (async () => { ${src} })()`)(db, req, a) } finally { db.close() }
}, [fn, arg])

async function waitFor(what, check, ms = 30000) {
  const until = Date.now() + ms
  for (;;) {
    const v = await check().catch(() => null)
    if (v) return v
    if (Date.now() > until) return fail(`timed out waiting for ${what}`)
    await new Promise((r) => setTimeout(r, 1000))
  }
}
const serverRows = (table, q = '') => api(`/rest/v1/${table}?user_id=eq.${userId}${q}`)

const a = await device()
// Wait for the app to create its database (opening it first would create an empty one).
const dbReady = (page) => waitFor('the local database', () => page.evaluate(async () => (await indexedDB.databases()).some((d) => d.name === 'forray-assist' && d.version >= 30)))
await dbReady(a)
const now = new Date().toISOString()
const foray = { id: crypto.randomUUID(), name: 'Sync test foray', startedAt: now, updatedAt: now }
const find = { id: crypto.randomUUID(), specimenId: '', forayId: foray.id, timestamp: now, geoprivacy: 'obscured', fieldNotes: { speciesGuess: 'Amanita muscaria' }, updatedAt: now }
const photoId = crypto.randomUUID()
const photoId2 = crypto.randomUUID()

await idb(a, `
  const t = db.transaction(['forays', 'specimens', 'photos', 'outbox'], 'readwrite')
  const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' })
  t.objectStore('forays').put(a.foray)
  t.objectStore('specimens').put(a.find)
  t.objectStore('photos').put({ id: a.photoId, specimenRowId: a.find.id, forayId: a.foray.id, source: 'capture', blob, mimeType: 'image/jpeg', capturedAt: a.now, isSelected: true, updatedAt: a.now })
  t.objectStore('photos').put({ id: a.photoId2, specimenRowId: a.find.id, forayId: a.foray.id, source: 'capture', blob, mimeType: 'image/jpeg', capturedAt: a.later, isSelected: false, updatedAt: a.now })
  for (const [table, rowId] of [['forays', a.foray.id], ['specimens', a.find.id], ['photos', a.photoId], ['photos', a.photoId2]])
    t.objectStore('outbox').add({ table, rowId, op: 'upsert', createdAt: a.now, attempts: 0 })
  await new Promise((res) => (t.oncomplete = res))
`, { foray, find, photoId, photoId2, now, later: new Date(Date.now() + 500).toISOString() })
await a.reload()
await waitFor('device A to upload', async () => (await serverRows('photos')).length === 2 && (await serverRows('specimens')).length === 1)
ok('device A uploaded its foray, find and two photos')

// Device B has never seen this find.
const b = await device()
await dbReady(b)
const pulled = await waitFor('device B to download', () => idb(b, `
  const s = await req(db.transaction('specimens').objectStore('specimens').get(a.find))
  const p = await req(db.transaction('photos').objectStore('photos').get(a.photo2))
  const f = await req(db.transaction('forays').objectStore('forays').get(a.foray))
  return s && p && f ? { species: s.fieldNotes.speciesGuess, synced: !!s.syncedAt, blob: p.blob instanceof Blob, path: p.storagePath, foray: f.name } : null
`, { find: find.id, photo2: photoId2, foray: foray.id }))
if (pulled.species !== 'Amanita muscaria' || pulled.foray !== 'Sync test foray' || !pulled.synced) fail('device B got ' + JSON.stringify(pulled))
ok('device B downloaded the foray and the find')
// The home page shows the foray's first photo as its cover, so that one image loads; the second waits.
if (pulled.blob || pulled.path !== `${userId}/photos/${photoId2}`) fail('photo image should wait until it is shown: ' + JSON.stringify(pulled))
ok('device B did not download a photo image nobody has looked at')
await waitFor('the cover photo to load', () => idb(b, `return (await req(db.transaction('photos').objectStore('photos').get(a))).blob instanceof Blob`, photoId))
ok('the foray cover image loaded on the home page')
await b.goto(`${APP}/forays/${foray.id}`)
await waitFor('the second photo to load once the find is open', () => idb(b, `const p = await req(db.transaction('photos').objectStore('photos').get(a)); return p.blob instanceof Blob && p.blob.size > 0`, photoId2))
ok('opening the find downloads its photos')
const queued = await idb(b, `return await req(db.transaction('outbox').objectStore('outbox').count())`)
if (queued !== 0) fail(`device B queued ${queued} uploads for rows it only downloaded`)
ok('downloaded rows are not uploaded back')

// An edit on A reaches B (B picks it up on its next sync; reload triggers one).
const later = new Date(Date.now() + 1000).toISOString()
await idb(a, `
  const t = db.transaction(['specimens', 'outbox'], 'readwrite')
  const s = await req(t.objectStore('specimens').get(a.id))
  s.fieldNotes.speciesGuess = 'Amanita persicina'; s.updatedAt = a.later
  t.objectStore('specimens').put(s)
  t.objectStore('outbox').add({ table: 'specimens', rowId: a.id, op: 'upsert', createdAt: a.later, attempts: 0 })
  await new Promise((res) => (t.oncomplete = res))
`, { id: find.id, later })
await a.reload()
await waitFor('the edit to upload', async () => (await serverRows('specimens'))[0]?.field_notes?.speciesGuess === 'Amanita persicina')
await b.reload()
await waitFor('device B to get the edit', () => idb(b, `return (await req(db.transaction('specimens').objectStore('specimens').get(a))).fieldNotes.speciesGuess === 'Amanita persicina'`, find.id))
ok('an edit on device A reaches device B')

// A delete on A removes the find on B (full pull on B's next launch).
await idb(a, `
  const t = db.transaction(['specimens', 'outbox'], 'readwrite')
  t.objectStore('specimens').delete(a.id)
  t.objectStore('outbox').add({ table: 'specimens', rowId: a.id, op: 'delete', createdAt: a.now, attempts: 0 })
  await new Promise((res) => (t.oncomplete = res))
`, { id: find.id, now: new Date().toISOString() })
await a.reload()
await waitFor('the delete to upload', async () => (await serverRows('specimens')).length === 0)
await b.reload()
await waitFor('device B to drop the deleted find', () => idb(b, `return !(await req(db.transaction('specimens').objectStore('specimens').get(a)))`, find.id))
const photoKept = await idb(b, `return !!(await req(db.transaction('photos').objectStore('photos').get(a)))`, photoId)
if (!photoKept) fail('device B dropped a photo the server still has')
ok('a delete on device A removes the find on device B, and nothing else')

await done(0)
