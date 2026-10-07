// Offline verification against the PRODUCTION build (service worker is off in dev).
// Usage: npm run build && node tests/offline.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { isValidId } from '../utils/idCode.ts'

const PORT = 4173
const URL = `http://localhost:${PORT}`
const server = spawn('node', ['.output/server/index.mjs'], { stdio: 'ignore', env: { ...process.env, PORT: String(PORT), NITRO_PORT: String(PORT) } })
const fail = async (msg, browser) => { console.error('FAIL:', msg); await browser?.close(); server.kill(); process.exit(1) }

await new Promise((r) => setTimeout(r, 4000))
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] })
const context = await browser.newContext({ permissions: ['geolocation', 'microphone'], geolocation: { latitude: 47.5, longitude: -121.8 } })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => { errors.push(e.message); console.error('pageerror:', e.message) })

await page.goto(URL)
await page.evaluate(() => navigator.serviceWorker.ready)
await page.waitForTimeout(3000) // let precache finish
await context.setOffline(true)
await page.reload()
await page.waitForSelector('text=Forray Assist', { timeout: 10000 }).catch(() => fail('shell did not load offline', browser))

// create a foray offline
await page.getByRole('button', { name: /start foray/i }).first().click({ force: true }).catch(() => fail('no create-foray control', browser))
await page.waitForURL(/\/forays\//, { timeout: 10000 }).catch(() => fail('Start foray did not open the foray', browser))
// log a find
await page.getByRole('button', { name: /new find without photo/i }).click().catch(() => fail('no new-find control', browser))
// No ID stock yet (not signed in): the find must show "ID pending", not an invented ID.
await page.waitForSelector('text=ID pending', { timeout: 10000 }).catch(() => fail('pending find did not show "ID pending"', browser))
// Give the device a stock of server-issued sets (what claim_id_sets would deliver); the pending find is numbered.
await page.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('forray-assist')
  r.onsuccess = () => {
    const tx = r.result.transaction('settings', 'readwrite')
    tx.objectStore('settings').put({ key: 'idSets', value: [{ network: 'B7QM', set: 0, next: 0 }] })
    tx.oncomplete = () => { window.dispatchEvent(new CustomEvent('fa-id-stock')); res() }
  }
}))
await page.waitForSelector('text=/B7QM-AAAA-[A-HJ-NP-Z2-9]/', { timeout: 10000 }).catch(() => fail('pending find was not numbered after the stock arrived', browser))
await page.getByText('Where it grows').first().click()
await page.getByLabel(/substrate/i).first().fill('decaying conifer')
await page.waitForTimeout(1200)
const url = page.url()
await page.reload() // cold reload while offline, deep link
await page.waitForSelector('text=/B7QM-AAAA-[A-HJ-NP-Z2-9]/', { timeout: 10000 }).catch(() => fail('find did not survive offline reload', browser))
await page.getByText('Where it grows').first().click()
await page.getByLabel(/substrate/i).first().inputValue().then((v) => v === 'decaying conifer' || fail('attribute lost after reload: ' + v, browser))
// IDs: every new find gets a unique ID that passes the check character; the UI ignores a second tap
// while a find is being created, so create one more and check both.
await page.getByRole('button', { name: /new find without photo/i }).click()
await page.waitForTimeout(1500)
const ids = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('forray-assist'); r.onsuccess = () => { const q = r.result.transaction('specimens').objectStore('specimens').getAll(); q.onsuccess = () => res(q.result.map((s) => s.specimenId)) } }))
if (ids.length < 2 || new Set(ids).size !== ids.length) fail('duplicate or missing specimen ids: ' + ids.join(','), browser)
if (!ids.every((i) => isValidId(i))) fail('an id failed validation: ' + ids.join(','), browser)
// Voice: record a note offline with a fake mic (no model downloaded -> raw audio saved), twice in a row
// (a leaked mic stream would make the second start fail with 'Could not start audio source').
for (let i = 0; i < 2; i++) {
  await page.getByRole('button', { name: /record voice note/i }).first().click()
  await page.waitForSelector('[aria-label="Stop recording"]', { timeout: 8000 }).catch(() => fail('recording did not start (attempt ' + (i + 1) + '): ' + 'mic error shown?', browser))
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: /stop recording/i }).first().click()
  await page.waitForSelector('[aria-label="Record voice note"]', { timeout: 8000 }).catch(() => fail('recording did not stop', browser))
}
const notes = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('forray-assist'); r.onsuccess = () => { const q = r.result.transaction('voiceNotes').objectStore('voiceNotes').count(); q.onsuccess = () => res(q.result) } }))
if (notes < 2) fail('expected 2 saved voice notes, got ' + notes, browser)
await page.goto(URL + '/settings')
await page.waitForSelector('text=/sync/i', { timeout: 10000 }).catch(() => fail('/settings did not load offline', browser))
// Review Mode on the foray page, offline: import 3 generated photos (2 sharp+close in time, 1 blurry),
// blur-score them in the production worker, group into finds.
await page.goto(url)
await page.getByRole('button', { name: /switch to review mode/i }).click().catch(() => fail('no review toggle', browser))
await page.waitForSelector('text=Add photos', { timeout: 10000 }).catch(() => fail('ReviewPanel did not render', browser))
const imgs = await page.evaluate(async () => {
  const make = async (kind) => {
    const c = document.createElement('canvas'); c.width = 600; c.height = 400
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 600, 400)
    g.fillStyle = '#000'
    if (kind === 'sharp') for (let y = 0; y < 400; y += 8) for (let x = (y / 8) % 2 ? 0 : 8; x < 600; x += 16) g.fillRect(x, y, 8, 8)
    if (kind === 'blur') { g.filter = 'blur(12px)'; g.fillRect(200, 100, 200, 200) }
    const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9))
    return Array.from(new Uint8Array(await b.arrayBuffer()))
  }
  return [await make('sharp'), await make('sharp'), await make('blur')]
})
await page.setInputFiles('input[type=file][multiple]', imgs.map((a, i) => ({ name: `p${i}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from(a) })))
await page.getByRole('button', { name: /group into finds/i }).click()
await page.waitForSelector('text=/3 photos grouped/', { timeout: 20000 }).catch(() => fail('photos were not grouped', browser))
await page.waitForSelector('text=2/3 selected', { timeout: 10000 }).catch(() => fail('blur scoring did not select the 2 sharpest of 3', browser))
// Settings: voice model card should render (no download attempted offline)
await page.goto(URL + '/settings')
await page.waitForSelector('text=/tiny/i', { timeout: 10000 }).catch(() => fail('voice model settings missing', browser))
if (errors.length) await fail('page errors: ' + errors.join(' | '), browser)
console.log('PASS: offline load, create foray, log find, persists across reload at', url)
await browser.close(); server.kill()
