// Settings → Voice → Browser speech recognition: records with a fake SpeechRecognition that
// listens to our own mic track, keeps the audio, and offers Whisper retranscription.
// Usage: npm run generate && node tests/browser-speech.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'

const PORT = 4178
const URL = `http://localhost:${PORT}`
const server = spawn('python3', ['-m', 'http.server', String(PORT), '-d', '.output/public'], { stdio: 'ignore' })
const fail = async (msg, browser) => { console.error('FAIL:', msg); await browser?.close(); server.kill(); process.exit(1) }
await new Promise((r) => setTimeout(r, 1500))

// OLD=1: an engine without track input must open the mic itself and never overlap getUserMedia.
const OLD = process.env.OLD === '1'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] })
const context = await browser.newContext({ permissions: ['microphone', 'geolocation'] })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.addInitScript((old) => {
  window.__startArgs = []
  window.__gum = 0
  const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
  navigator.mediaDevices.getUserMedia = (c) => { window.__gum++; return real(c) }
  class FakeRec {
    static available() { return Promise.resolve('available') }
    start(track) {
      window.__startArgs.push(track ? track.constructor.name : 'none')
      setTimeout(() => this.onresult?.({ results: [Object.assign([{ transcript: 'white gills under oaks' }], { isFinal: true })] }), 200)
    }
    stop() { setTimeout(() => this.onend?.(), 20) }
  }
  if (old) delete FakeRec.available
  window.SpeechRecognition = FakeRec
  delete window.webkitSpeechRecognition
}, OLD)

await page.goto(`${URL}/settings`)
await page.getByText('Browser speech recognition', { exact: true }).click()
await page.waitForTimeout(300)
await page.goto(URL)
await page.getByRole('button', { name: /start foray/i }).first().click({ force: true })
await page.waitForURL(/\/forays\//)
await page.getByText('Browser speech recognition').first().waitFor({ timeout: 5000 }).catch(() => fail('recorder hint does not show browser speech', browser))
await page.getByRole('button', { name: /record voice note/i }).first().click()
await page.waitForSelector('[aria-label="Stop recording"]', { timeout: 10000 }).catch(() => fail('did not start recording', browser))
await page.waitForTimeout(1500)
await page.getByRole('button', { name: /stop recording/i }).first().click()
await page.waitForSelector('[aria-label="Record voice note"]', { timeout: 8000 }).catch(() => fail('did not stop', browser))
await page.waitForTimeout(500)

const args = await page.evaluate(() => window.__startArgs)
const gum = await page.evaluate(() => window.__gum)
if (!(await page.getByText('white gills under oaks').count())) await fail('transcript missing', browser)
if (OLD) {
  if (args[0] !== 'none' || gum !== 0) await fail(`old engine: expected no track and no getUserMedia, got ${JSON.stringify(args)} / ${gum}`, browser)
  if (await page.locator('audio').count()) await fail('old engine should not have audio', browser)
  if (errors.length) await fail('page errors: ' + errors.join(' | '), browser)
  console.log('PASS: older engine opens the mic itself, no overlapping capture')
  await browser.close(); server.kill(); process.exit(0)
}
if (args[0] !== 'MediaStreamTrack') await fail('recognition was not given the mic track: ' + JSON.stringify(args), browser)
if (!(await page.locator('audio').count())) await fail('audio was not kept', browser)
if (!(await page.getByText('web-speech').count())) await fail('note not tagged web-speech', browser)
if (!(await page.getByRole('button', { name: /transcribe/i }).count())) await fail('no (re)transcribe button', browser)
if (errors.length) await fail('page errors: ' + errors.join(' | '), browser)
await page.screenshot({ path: process.env.SHOT ?? '/dev/null', fullPage: true }).catch(() => {})
console.log('PASS: browser speech listened to the mic track, kept the audio, and offers retranscription')
await browser.close()
server.kill()
