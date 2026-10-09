// Browser check of the Phase 12/13 screens against the PRODUCTION build, no Supabase needed:
//   1. Phone A sends a find as a file; phone B (separate browser profile) opens it, previews it
//      and adds it as someone else's find.
//   2. A shared foray (seeded the way refreshForay stores it) shows everyone's finds, comments,
//      the share dialog with join code + QR, and the nearby alerts card.
// Usage: npm run build && node tests/shared-ui.mjs   (SHOT_DIR=... to keep screenshots)
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 4177
const URL = `http://localhost:${PORT}`
const OUT = process.env.SHOT_DIR || mkdtempSync(join(tmpdir(), 'fa-shots-'))
const server = spawn('node', ['.output/server/index.mjs'], { stdio: 'ignore', env: { ...process.env, PORT: String(PORT), NITRO_PORT: String(PORT) } })
let browser
const fail = async (msg) => { console.error('FAIL:', msg); await browser?.close(); server.kill(); process.exit(1) }
await new Promise((r) => setTimeout(r, 3000))
browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ['geolocation'], geolocation: { latitude: 39.7392, longitude: -104.9903 }, acceptDownloads: true }
const errors = []

async function newPhone() {
  const ctx = await browser.newContext(phone)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(URL)
  await page.waitForTimeout(1500)
  return { ctx, page }
}

async function idb(page, fn, arg) {
  return page.evaluate(([src, a]) => new Promise((res, rej) => {
    const r = indexedDB.open('forray-assist')
    r.onerror = () => rej(r.error)
    r.onsuccess = () => { const f = new Function('db', 'arg', `return (${src})(db, arg)`); Promise.resolve(f(r.result, a)).then(res, rej) }
  }), [fn.toString(), arg])
}
const put = (store, rows) => (db, arg) => new Promise((res) => {
  const tx = db.transaction(arg.store, 'readwrite')
  for (const row of arg.rows) tx.objectStore(arg.store).put(row)
  tx.oncomplete = () => res()
})

// ---- 1. Send a find from A, open it on B ---------------------------------------------------
const A = await newPhone()
await A.page.getByRole('button', { name: /start foray/i }).first().click({ force: true })
await A.page.waitForURL(/forays/)
await A.page.getByRole('button', { name: /new find without photo/i }).click()
await A.page.waitForSelector('text=ID pending')
// Give the find a real ID and a species guess, as it would have after a claim.
await idb(A.page, (db) => new Promise((res) => {
  const tx = db.transaction('specimens', 'readwrite')
  const st = tx.objectStore('specimens')
  st.getAll().onsuccess = (e) => { for (const s of e.target.result) st.put({ ...s, specimenId: 'B7QMAAAB6', fieldNotes: { speciesGuess: 'Amanita muscaria', substrate: 'Under spruce' }, geoprivacy: 'obscured' }) }
  tx.oncomplete = () => res()
}))
await A.page.reload() // Dexie live queries don't see raw IndexedDB writes
await A.page.waitForSelector('text=B7QM-AAAB-6', { timeout: 10000 }).catch(() => fail('seeded find not shown'))
const [download] = await Promise.all([
  A.page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
  A.page.getByRole('button', { name: /^send$/i }).first().click(),
])
if (!download) await fail('Send did not produce a file')
const file = join(OUT, download.suggestedFilename())
await download.saveAs(file)
const pkg = JSON.parse(readFileSync(file, 'utf8'))
if (pkg.format !== 'foray-assist/find' || !pkg.record.sig) await fail('sent file is not a signed find package')
if (Math.abs(pkg.record.latitude - 39.7) > 1e-9) await fail(`obscured find leaked its location: ${pkg.record.latitude}`)
console.log('sent', download.suggestedFilename())

const B = await newPhone()
await B.page.getByRole('button', { name: /start foray/i }).first().click({ force: true })
await B.page.waitForURL(/forays/)
await B.page.waitForTimeout(800)
await B.page.locator('input[type=file][accept*=forayfind]').setInputFiles(file)
await B.page.waitForSelector('text=Add this find?', { timeout: 10000 }).catch(() => fail('no preview for the received file'))
await B.page.waitForSelector("text=Can't confirm who sent this").catch(() => fail('unknown sender not flagged'))
await B.page.screenshot({ path: `${OUT}/receive-preview.png` })
await B.page.getByRole('button', { name: /add find/i }).click()
await B.page.waitForSelector('text=Received file', { timeout: 10000 }).catch(() => fail('received find not shown'))
await B.page.waitForSelector('text=Amanita muscaria').catch(() => fail('received find lost its notes'))
// Opening the same file again is refused as a duplicate.
await B.page.locator('input[type=file][accept*=forayfind]').setInputFiles(file)
await B.page.waitForSelector('text=You already have this find').catch(() => fail('duplicate not refused'))
await B.page.keyboard.press('Escape')
console.log('received and added; duplicate refused')

// ---- 2. A shared foray as a member sees it -----------------------------------------------
const F = 'f0000000-0000-4000-8000-0000000000aa'
const now = new Date().toISOString()
const key = Buffer.from(Array.from({ length: 32 }, (_, i) => i)).toString('base64')
await idb(B.page, put(), { store: 'forays', rows: [{
  id: F, name: 'FRMS Fall Foray', startedAt: now, updatedAt: now,
  shared: { role: 'owner', joinCode: 'AB3DEF9H', meshKey: key, societyName: 'Front Range Mycological Society', refreshedAt: now,
    members: [
      { userId: 'u1', displayName: 'Skyler', role: 'owner', keys: [] },
      { userId: 'u2', displayName: 'Amy', role: 'leader', keys: [] },
      { userId: 'u3', displayName: 'Jordan', role: 'member', keys: [] },
    ] },
}] })
await idb(B.page, put(), { store: 'peerFinds', rows: [
  { id: 'p1', forayId: F, source: 'server', userId: 'u2', authorName: 'Amy', specimenId: 'C9XKAAAC4', timestamp: now, latitude: 39.7, longitude: -105.1, geoprivacy: 'obscured', fieldNotes: { speciesGuess: 'Boletus rubriceps', hostTree: 'Spruce' }, photos: [], updatedAt: now, receivedAt: now },
  { id: 'p2', forayId: F, source: 'server', userId: 'u3', authorName: 'Jordan', specimenId: 'D2MNAAAD7', timestamp: now, geoprivacy: 'private', fieldNotes: { notes: 'Bright orange, gilled' }, photos: [], updatedAt: now, receivedAt: now },
] })
await idb(B.page, put(), { store: 'comments', rows: [
  { id: 'c1', forayId: F, specimenRowId: 'p1', kind: 'suggestion', body: 'Red-capped, on spruce', taxon: 'Boletus rubriceps', authorName: 'Jordan', userId: 'u3', mine: 0, createdAt: now, updatedAt: now, syncedAt: now },
  { id: 'c2', forayId: F, specimenRowId: 'p1', kind: 'agree', body: '', taxon: 'Boletus rubriceps', authorName: 'Skyler', userId: 'u1', mine: 0, createdAt: now, updatedAt: now, syncedAt: now },
] })
await B.page.goto(`${URL}/forays/${F}`)
await B.page.waitForSelector("text=Everyone's finds", { timeout: 10000 }).catch(() => fail('shared foray has no shared section'))
await B.page.waitForSelector('text=Location private').catch(() => fail('private find shows a location'))
await B.page.waitForSelector('text=about 20 km area').catch(() => fail('obscured find not shown as an area'))
await B.page.getByText('Comments and IDs').first().click()
await B.page.waitForSelector('text=Red-capped, on spruce').catch(() => fail('comments not shown'))
await B.page.locator("text=Everyone's finds").scrollIntoViewIfNeeded()
await B.page.screenshot({ path: `${OUT}/shared-foray.png` })
await B.page.evaluate(() => window.scrollTo(0, 0))
await B.page.getByRole('button', { name: /shared · 3/i }).click()
await B.page.waitForSelector('[data-testid=join-code]').catch(() => fail('share dialog has no join code'))
const shown = await B.page.locator('[data-testid=join-code]').innerText()
if (shown.trim() !== 'AB3D-EF9H') await fail(`join code shown as ${shown}`)
await B.page.waitForSelector('img[alt="QR code to join this foray"]').catch(() => fail('no QR code'))
await B.page.waitForTimeout(500)
await B.page.screenshot({ path: `${OUT}/share-dialog.png` })
await B.page.keyboard.press('Escape')
// Nearby card: off by default, turns on and runs the duty cycle.
await B.page.waitForSelector('text=Nearby alerts').catch(() => fail('no nearby card'))
await B.page.locator('.nearby .v-switch .v-selection-control__input').first().click()
await B.page.waitForSelector('text=/within 200 m/', { timeout: 10000 }).catch(async () => fail('nearby did not start: ' + (await B.page.locator('.nearby').first().innerText())))
await B.page.locator('text=Nearby alerts').scrollIntoViewIfNeeded()
await B.page.screenshot({ path: `${OUT}/nearby.png` })

// ---- 3. Join page and home ----------------------------------------------------------------
await B.page.goto(`${URL}/join/ab3d-ef9h`)
await B.page.waitForSelector('text=Join a shared foray').catch(() => fail('join link page missing'))
const val = await B.page.locator('[data-testid=join-code-input] input').inputValue()
if (!/ab3d-ef9h/i.test(val)) await fail(`join code not prefilled: ${val}`)
await B.page.screenshot({ path: `${OUT}/join.png` })
await B.page.goto(URL)
await B.page.waitForTimeout(1200)
await B.page.screenshot({ path: `${OUT}/home.png` })
await B.page.goto(`${URL}/settings`)
await B.page.waitForSelector('text=Societies').catch(() => fail('no societies card'))
await B.page.locator('text=Societies').first().scrollIntoViewIfNeeded()
await B.page.screenshot({ path: `${OUT}/settings-societies.png` })

if (errors.length) await fail(`page errors: ${errors.join(' | ')}`)
console.log('PASS shared-ui', OUT)
await browser.close()
server.kill()
