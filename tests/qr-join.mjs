// Browser check of QR sharing against the PRODUCTION build, no Supabase needed:
//   1. The share dialog of a shared foray shows the join QR, offline.
//   2. On another phone, offline, Join a shared foray -> Scan QR code reads that QR from a fake
//      camera (jsQR path; headless Chromium has no BarcodeDetector) and fills the code. "Join offline"
//      opens the foray at once (same id as the owner's), a find can be logged into it, and home lists
//      the join under "Waiting to join".
//   3. A typed code offline (no foray details) is saved with "Join later".
// Usage: npm run build && node tests/qr-join.mjs   (SHOT_DIR=... to keep screenshots)
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import QR from 'qrcode'

const PORT = 4178
const URL = `http://localhost:${PORT}`
const OUT = process.env.SHOT_DIR || mkdtempSync(join(tmpdir(), 'fa-qr-'))
const CODE = 'AB3DEF9H'
const F = 'f0000000-0000-4000-8000-0000000000bb'
const STARTED = '2026-10-17T09:00:00.000Z'

// A Y4M "camera" showing the join QR (what the share dialog encodes).
function qrVideo(text) {
  const W = 640, H = 480, S = 10
  const m = QR.create(text, { errorCorrectionLevel: 'M' }).modules
  const size = m.size * S
  const ox = (W - size) >> 1, oy = (H - size) >> 1
  const y = Buffer.alloc(W * H, 235)
  for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) {
    if (!m.get(r, c)) continue
    for (let dy = 0; dy < S; dy++) y.fill(16, (oy + r * S + dy) * W + ox + c * S, (oy + r * S + dy) * W + ox + c * S + S)
  }
  const uv = Buffer.alloc((W / 2) * (H / 2) * 2, 128)
  const frame = Buffer.concat([Buffer.from('FRAME\n'), y, uv])
  const path = join(OUT, 'qr.y4m')
  writeFileSync(path, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`), frame, frame]))
  return path
}

const server = spawn('node', ['.output/server/index.mjs'], { stdio: 'ignore', env: { ...process.env, PORT: String(PORT), NITRO_PORT: String(PORT) } })
let browser
const fail = async (msg) => { console.error('FAIL:', msg); await browser?.close(); server.kill(); process.exit(1) }
await new Promise((r) => setTimeout(r, 3000))
browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${qrVideo(`${URL}/join/${CODE}?f=${F}&n=Trailhead+Foray&t=${encodeURIComponent(STARTED)}`)}`],
})
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ['camera'] }
const errors = []

async function newPhone() {
  const ctx = await browser.newContext(phone)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(URL)
  await page.waitForTimeout(2500) // service worker installs and precaches
  return { ctx, page }
}

// ---- 1. Owner's share dialog, offline ------------------------------------------------------
const A = await newPhone()
const now = new Date().toISOString()
await A.page.evaluate(([row]) => new Promise((res, rej) => {
  const r = indexedDB.open('forray-assist')
  r.onerror = () => rej(r.error)
  r.onsuccess = () => { const tx = r.result.transaction('forays', 'readwrite'); tx.objectStore('forays').put(row); tx.oncomplete = () => res() }
}), [{
  id: F, name: 'Trailhead Foray', startedAt: STARTED, updatedAt: now,
  shared: { role: 'owner', joinCode: CODE, refreshedAt: now, members: [{ userId: 'u1', displayName: 'Skyler', role: 'owner', keys: [] }] },
}])
await A.ctx.setOffline(true)
await A.page.goto(`${URL}/forays/${F}`)
await A.page.getByRole('button', { name: /shared · 1/i }).click()
await A.page.waitForSelector('[data-testid="join-qr"]', { timeout: 10000 }).catch(() => fail('no QR in share dialog offline'))
await A.page.waitForTimeout(400)
await A.page.screenshot({ path: `${OUT}/share-qr.png` })

// ---- 2. Joiner scans it, offline -------------------------------------------------------------
const B = await newPhone()
await B.ctx.setOffline(true)
await B.page.getByRole('button', { name: /join a shared foray/i }).click()
await B.page.waitForSelector('[data-testid="join-offline"]').catch(() => fail('no offline note in join form'))
await B.page.screenshot({ path: `${OUT}/join-offline.png` })
await B.page.getByTestId('scan-qr').click()
await B.page.waitForSelector('[data-testid="qr-video"]')
await B.page.waitForFunction(() => document.querySelector('[data-testid="join-code-input"] input')?.value === 'AB3D-EF9H', null, { timeout: 15000 })
  .catch(() => fail('scan did not fill the code'))
await B.page.getByLabel('Your name, as members see it').fill('Amy')
await B.page.waitForSelector('[data-testid="join-offline"] >> text=Trailhead Foray').catch(() => fail('offline note does not name the foray'))
await B.page.waitForTimeout(400)
await B.page.screenshot({ path: `${OUT}/join-scanned.png` })
await B.page.getByRole('button', { name: /join offline/i }).click()
await B.page.waitForURL(new RegExp(`/forays/${F}`), { timeout: 10000 }).catch(() => fail('join offline did not open the foray'))
await B.page.waitForSelector('text=Trailhead Foray')
await B.page.getByRole('button', { name: /new find without photo/i }).click()
await B.page.waitForSelector('text=ID pending', { timeout: 10000 }).catch(() => fail('could not log a find in the offline-joined foray'))
await B.page.waitForTimeout(500)
await B.page.screenshot({ path: `${OUT}/joined-offline.png` })
const finds = await B.page.evaluate((id) => new Promise((res) => {
  const r = indexedDB.open('forray-assist')
  r.onsuccess = () => { const q = r.result.transaction('specimens').objectStore('specimens').getAll(); q.onsuccess = () => res(q.result.filter((s) => s.forayId === id).length) }
}), F)
if (finds !== 1) await fail(`expected 1 find in the shared foray, got ${finds}`)
await B.page.goto(`${URL}/forays/${F}`)
await B.page.getByRole('button', { name: /shared · 0/i }).first().click()
await B.page.waitForSelector('[data-testid="pending-join-note"]').catch(() => fail('share dialog does not say the join is pending'))
await B.page.waitForTimeout(400)
await B.page.screenshot({ path: `${OUT}/joined-offline-share.png` })

// ---- 3. Typed code offline: saved for later ---------------------------------------------------
await B.page.goto(URL)
await B.page.getByRole('button', { name: /join a shared foray/i }).click()
await B.page.getByTestId('join-code-input').locator('input').fill('CDEF-GHJK')
await B.page.getByLabel('Your name, as members see it').fill('Amy')
await B.page.getByRole('button', { name: /join later/i }).click()
await B.page.waitForSelector('[data-testid="pending-joins"] >> text=CDEF-GHJK', { timeout: 10000 }).catch(() => fail('typed code not saved'))
await B.page.waitForSelector('[data-testid="pending-joins"] >> text=AB3D-EF9H')
await B.page.locator('[data-testid="pending-joins"]').scrollIntoViewIfNeeded()
await B.page.waitForTimeout(800)
await B.page.screenshot({ path: `${OUT}/pending.png` })

if (errors.length) await fail(`page errors: ${errors.join(' | ')}`)
await browser.close()
server.kill()
console.log('PASS qr-join', OUT)
