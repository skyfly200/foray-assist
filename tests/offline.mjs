// Offline verification against the PRODUCTION build (service worker is off in dev).
// Usage: npm run build && node tests/offline.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'

const PORT = 4173
const URL = `http://localhost:${PORT}`
const server = spawn('npx', ['serve', '.output/public', '-s', '-l', String(PORT)], { stdio: 'ignore' })
const fail = async (msg, browser) => { console.error('FAIL:', msg); await browser?.close(); server.kill(); process.exit(1) }

await new Promise((r) => setTimeout(r, 4000))
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const context = await browser.newContext({ permissions: ['geolocation'], geolocation: { latitude: 47.5, longitude: -121.8 } })
const page = await context.newPage()
page.on('pageerror', (e) => console.error('pageerror:', e.message))

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
const url = page.url()
await page.reload() // cold reload while offline, deep link
await page.waitForSelector('text=/FORAY-\\d{8}-[A-Z0-9]{2}-001/', { timeout: 10000 }).catch(() => fail('find did not survive offline reload', browser))
console.log('PASS: offline load, create foray, log find, persists across reload at', url)
await browser.close(); server.kill()
