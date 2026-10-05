// Offline verification against the PRODUCTION build (service worker is off in dev).
// Usage: npm run build && node tests/offline.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'

const PORT = 4173
const URL = `http://localhost:${PORT}`
const server = spawn('node', ['.output/server/index.mjs'], { stdio: 'ignore', env: { ...process.env, PORT: String(PORT), NITRO_PORT: String(PORT) } })
const fail = async (msg, browser) => { console.error('FAIL:', msg); await browser?.close(); server.kill(); process.exit(1) }

await new Promise((r) => setTimeout(r, 4000))
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const context = await browser.newContext({ permissions: ['geolocation'], geolocation: { latitude: 47.5, longitude: -121.8 } })
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
await page.getByRole('button', { name: /new foray|start foray|create/i }).first().click().catch(() => fail('no create-foray control', browser))
await page.waitForTimeout(500)
await page.getByText(/20\d\d/).first().click()
await page.waitForURL(/\/forays\//)
// log a find
await page.getByRole('button', { name: /new find/i }).click().catch(() => fail('no new-find control', browser))
await page.waitForSelector('text=/FORAY-\\d{8}-[A-Z0-9]{2}-001/', { timeout: 10000 }).catch(() => fail('specimen id not shown', browser))
await page.getByLabel(/substrate/i).first().fill('decaying conifer')
await page.waitForTimeout(1200)
const url = page.url()
await page.reload() // cold reload while offline, deep link
await page.waitForSelector('text=/FORAY-\\d{8}-[A-Z0-9]{2}-001/', { timeout: 10000 }).catch(() => fail('find did not survive offline reload', browser))
await page.getByLabel(/substrate/i).first().inputValue().then((v) => v === 'decaying conifer' || fail('attribute lost after reload: ' + v, browser))
await page.goto(URL + '/settings')
await page.waitForSelector('text=/sync/i', { timeout: 10000 }).catch(() => fail('/settings did not load offline', browser))
// Review Mode on the foray page, offline: import 3 generated photos (2 sharp+close in time, 1 blurry),
// blur-score them in the production worker, group into finds.
await page.goto(url)
await page.getByRole('button', { name: /^review$/i }).click().catch(() => fail('no review toggle', browser))
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
