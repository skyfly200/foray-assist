// Browser check that a stuck or rate-limited voice model download can be stopped and retried.
// Usage: npm run generate && node tests/stuck-tasks.mjs
// Hugging Face is simulated with Playwright routes: first HTTP 429, then a request that never answers.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'

const PORT = 4177
const URL = `http://localhost:${PORT}`
const server = spawn('npx', ['serve', '-s', '.output/public', '-l', String(PORT)], { stdio: 'ignore' })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const done = async (code, msg) => { if (msg) console.error(msg); await browser.close(); server.kill(); process.exit(code) }
const fail = (msg) => done(1, 'FAIL: ' + msg)

await new Promise((r) => setTimeout(r, 3000))
const context = await browser.newContext({ serviceWorkers: 'block' })
let mode = '429'
await context.route(/huggingface\.co|hf\.co/, (route) => {
  if (mode === '429') return route.fulfill({ status: 429, headers: { 'retry-after': '120', 'access-control-allow-origin': '*', 'access-control-expose-headers': 'retry-after' }, body: 'Too Many Requests' })
  // 'hang': never answer
})
const page = await context.newPage()
page.on('pageerror', (e) => console.error('pageerror:', e.message))

await page.goto(`${URL}/settings`)
const card = page.locator('.fa-card', { hasText: 'Voice notes model' })
await card.waitFor({ timeout: 15000 }).catch(() => fail('voice model card missing'))

// 1) Rate limited: the message says so.
await card.getByRole('button', { name: /download voice model/i }).click()
await card.getByText(/limiting requests right now \(HTTP 429/).waitFor({ timeout: 60000 }).catch(() => fail('429 was not explained'))
console.log('msg:', await card.locator('[role=status]').innerText())
await card.getByText(/about 2 minutes/).waitFor({ timeout: 2000 }).catch(() => fail('Retry-After not shown'))
console.log('ok: 429 explained:', await card.locator('[role=status]').innerText())

// 2) Stuck: Stop is offered and puts the card back to "not downloaded".
mode = 'hang'
await card.getByRole('button', { name: /retry download/i }).click()
await card.getByRole('button', { name: /^stop$/i }).waitFor({ timeout: 10000 }).catch(() => fail('no Stop button while downloading'))
await card.getByRole('button', { name: /^stop$/i }).click()
await card.getByText(/^Not downloaded/).waitFor({ timeout: 5000 }).catch(() => fail('Stop did not reset the download'))
await card.getByRole('button', { name: /download voice model/i }).waitFor({ timeout: 2000 }).catch(() => fail('download button not back after Stop'))
console.log('ok: Stop resets a stuck download')

// 3) Stuck with no Stop press: the headers timeout ends it with a Retry.
await card.getByRole('button', { name: /download voice model/i }).click()
await card.getByText(/did not answer within 30 seconds/).waitFor({ timeout: 50000 }).catch(() => fail('hung request never timed out'))
await card.getByRole('button', { name: /retry download/i }).waitFor({ timeout: 2000 }).catch(() => fail('no Retry after timeout'))
console.log('ok: hung request times out with Retry')
await done(0)
