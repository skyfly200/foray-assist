// Screenshots of the main screens at phone size (manual visual check; not part of CI).
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'

const OUT = process.env.SHOT_DIR || '.'
const server = spawn('node', ['.output/server/index.mjs'], { stdio: 'ignore', env: { ...process.env, PORT: '4176', NITRO_PORT: '4176' } })
await new Promise((r) => setTimeout(r, 3000))
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await b.newContext({ viewport: { width: 380, height: 780 }, deviceScaleFactor: 2, permissions: ['geolocation'], geolocation: { latitude: 47.5, longitude: -121.8 } })
const p = await ctx.newPage()
await p.goto('http://localhost:4176/')
await p.waitForTimeout(2000)
await p.screenshot({ path: `${OUT}/home.png` })
await p.getByRole('button', { name: /start foray/i }).first().click({ force: true })
await p.waitForURL(/forays/)
await p.waitForTimeout(1200)
await p.getByRole('button', { name: /new find without photo/i }).click()
await p.waitForTimeout(1500)
await p.screenshot({ path: `${OUT}/foray.png` })
await p.goto('http://localhost:4176/settings')
await p.waitForTimeout(1500)
await p.screenshot({ path: `${OUT}/settings.png` })
await b.close()
server.kill()
