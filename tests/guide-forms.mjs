// Screenshots of the form-aware guided capture at phone size (manual visual check; not part of CI).
// Run after `npm run build`: node tests/guide-forms.mjs  (writes to screenshots/guide-forms/)
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'

const OUT = process.env.SHOT_DIR || 'screenshots/guide-forms'
const PORT = '4177'
const server = spawn('node', ['.output/server/index.mjs'], { stdio: 'ignore', env: { ...process.env, PORT, NITRO_PORT: PORT } })
await new Promise((r) => setTimeout(r, 3000))
const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--no-sandbox'],
})
try {
  const ctx = await b.newContext({ viewport: { width: 380, height: 780 }, deviceScaleFactor: 2, permissions: ['camera', 'geolocation'], geolocation: { latitude: 47.5, longitude: -121.8 } })
  const p = await ctx.newPage()
  await p.goto(`http://localhost:${PORT}/`)
  await p.waitForTimeout(2000)
  await p.getByRole('button', { name: /start foray/i }).first().click({ force: true })
  await p.waitForURL(/forays/)
  await p.waitForTimeout(1200)
  await p.getByRole('button', { name: /new find without photo/i }).click()
  await p.waitForTimeout(1200)
  await p.getByRole('button', { name: /guided capture/i }).first().click()
  await p.waitForURL(/guide/)
  await p.waitForTimeout(1500)
  // A new find has no form, so the picker opens by itself.
  await p.screenshot({ path: `${OUT}/picker.png` })

  await p.getByText('Gilled mushroom', { exact: true }).click()
  await p.waitForTimeout(800)
  await p.screenshot({ path: `${OUT}/gilled.png` })

  // Change to a crust: the stem shot goes, the surface and habitat stay.
  await p.getByRole('button', { name: /change the form/i }).click()
  await p.waitForTimeout(600)
  await p.getByText('Crust or resupinate', { exact: true }).click()
  await p.waitForTimeout(800)
  await p.screenshot({ path: `${OUT}/crust.png` })
} finally {
  await b.close()
  server.kill()
}
