// Model routing: Settings → Voice → Browser speech reorders the speech route, and when browser
// speech loses the network mid-note the same note carries on with the next model (record only
// here, Whisper isn't downloaded) and keeps the words already heard plus the audio.
// Usage: npm run generate && node tests/route-fallback.mjs   (OLD=1: recognizer that opens the mic itself)
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'

const PORT = 4181
const URL = `http://localhost:${PORT}`
const OLD = process.env.OLD === '1'
const server = spawn('python3', ['-m', 'http.server', String(PORT), '-d', '.output/public'], { stdio: 'ignore' })
const fail = async (msg, browser) => { console.error('FAIL:', msg); await browser?.close(); server.kill(); process.exit(1) }
await new Promise((r) => setTimeout(r, 1500))

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] })
const context = await browser.newContext({ permissions: ['microphone', 'geolocation'] })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.addInitScript((old) => {
  // Hears a few words, then loses the network.
  class FakeRec {
    static available() { return Promise.resolve('available') }
    start() {
      setTimeout(() => this.onresult?.({ results: [Object.assign([{ transcript: 'brown convex cap' }], { isFinal: true })] }), 300)
      setTimeout(() => { this.onerror?.({ error: 'network' }); this.onend?.() }, 800)
    }
    stop() { setTimeout(() => this.onend?.(), 10) }
  }
  if (old) delete FakeRec.available
  window.SpeechRecognition = FakeRec
  delete window.webkitSpeechRecognition
}, OLD)

await page.goto(`${URL}/settings`)
await page.getByText('Browser speech recognition', { exact: true }).click()
await page.waitForTimeout(300)
await page.goto(`${URL}/models`)
const route = await page.getByTestId('route-speech').innerText().catch(() => '')
if (!/Speech to text\s+Browser speech, if that fails, Whisper/.test(route)) await fail(`Settings choice did not reorder the route: ${route}`, browser)

await page.goto(URL)
await page.getByRole('button', { name: /start foray/i }).first().click({ force: true })
await page.waitForURL(/\/forays\//)
await page.getByRole('button', { name: /record voice note/i }).first().click()
await page.waitForSelector('[aria-label="Stop recording"]', { timeout: 10000 }).catch(() => fail('did not start recording', browser))
await page.getByText(/Browser speech needs a connection, so this recording carries on with Record only/).waitFor({ timeout: 5000 })
  .catch(() => fail('no fallback notice', browser))
await page.waitForTimeout(1500)
await page.getByRole('button', { name: /stop recording/i }).first().click()
await page.waitForSelector('[aria-label="Record voice note"]', { timeout: 8000 }).catch(() => fail('did not stop', browser))
await page.waitForTimeout(800)
const notes = await page.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('forray-assist')
  r.onsuccess = () => { const g = r.result.transaction('voiceNotes').objectStore('voiceNotes').getAll(); g.onsuccess = () => res(g.result.map((n) => ({ model: n.model, audio: n.audio?.size ?? 0, text: n.transcript }))) }
}))
const n = notes[0]
if (notes.length !== 1) await fail(`expected one note, got ${JSON.stringify(notes)}`, browser)
if (n.text !== 'brown convex cap') await fail(`words heard before the failure were lost: ${JSON.stringify(n)}`, browser)
if (n.model !== 'web-speech + none') await fail(`note not tagged as a fallback: ${n.model}`, browser)
if (!n.audio) await fail('audio after the fallback was not kept', browser)
if (errors.length) await fail('page errors: ' + errors.join(' | '), browser)
console.log(`PASS: route reordered from Settings; browser speech fell back to record only on the same note${OLD ? ' (mic opened by the recognizer)' : ' (shared mic track)'}`)
await browser.close()
server.kill()
