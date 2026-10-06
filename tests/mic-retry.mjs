// Forces the first getUserMedia call to reject with NotReadableError ("Could not start audio source")
// and checks the recorder retries and records. Also checks /ort runtime MIME types.
// Usage: npm run build && node tests/mic-retry.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'

const PORT = 4177
const URL = `http://localhost:${PORT}`
const server = spawn('node', ['.output/server/index.mjs'], { stdio: 'ignore', env: { ...process.env, PORT: String(PORT), NITRO_PORT: String(PORT) } })
const fail = async (msg, browser) => { console.error('FAIL:', msg); await browser?.close(); server.kill(); process.exit(1) }
await new Promise((r) => setTimeout(r, 3500))

for (const f of ['ort-wasm-simd-threaded.asyncify.wasm', 'ort-wasm-simd-threaded.asyncify.mjs']) {
  const r = await fetch(`${URL}/ort/${f}`, { method: 'HEAD' })
  const ct = r.headers.get('content-type') || ''
  const ok = f.endsWith('.wasm') ? ct.includes('application/wasm') : /javascript/.test(ct)
  if (r.status !== 200 || !ok) await fail(`/ort/${f}: status ${r.status}, content-type "${ct}"`)
  console.log(`ok: /ort/${f} -> ${r.status} ${ct}`)
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] })
const context = await browser.newContext({ permissions: ['microphone', 'geolocation'] })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.addInitScript(() => {
  // No Web Speech -> the recorder must use real audio capture (getUserMedia).
  delete window.SpeechRecognition
  delete window.webkitSpeechRecognition
  const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
  let calls = 0
  window.__gumCalls = () => calls
  navigator.mediaDevices.getUserMedia = (c) => {
    calls++
    if (calls === 1) return Promise.reject(new DOMException('Could not start audio source', 'NotReadableError'))
    return real(c)
  }
})
await page.goto(URL)
await page.getByRole('button', { name: /start foray/i }).first().click({ force: true })
await page.waitForURL(/\/forays\//)
await page.getByRole('button', { name: /record voice note/i }).first().click()
await page.waitForSelector('[aria-label="Stop recording"]', { timeout: 10000 }).catch(() => fail('retry after NotReadableError did not start recording', browser))
const calls = await page.evaluate(() => window.__gumCalls())
if (calls < 2) await fail('expected a retry (>=2 getUserMedia calls), got ' + calls, browser)
await page.waitForTimeout(1000)
await page.getByRole('button', { name: /stop recording/i }).first().click()
await page.waitForSelector('[aria-label="Record voice note"]', { timeout: 8000 }).catch(() => fail('did not stop', browser))
if (errors.length) await fail('page errors: ' + errors.join(' | '), browser)
console.log(`PASS: mic start survived a forced NotReadableError (getUserMedia calls: ${calls})`)
await browser.close()
server.kill()
