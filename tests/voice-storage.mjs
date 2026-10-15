// Settings → Voice notes model → Space on this device: lists downloaded Whisper models with
// their size and deletes them. The speech engine goes with the last model.
// Usage: npm run generate && node tests/voice-storage.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'

const PORT = 4179
const URL = `http://localhost:${PORT}`
const server = spawn('python3', ['-m', 'http.server', String(PORT), '-d', '.output/public'], { stdio: 'ignore' })
const fail = async (msg, browser) => { console.error('FAIL:', msg); await browser?.close(); server.kill(); process.exit(1) }
await new Promise((r) => setTimeout(r, 1500))

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

// Seed fake cached files: both models (30 MB + 70 MB) and the runtime in both caches (2 x 10 MB).
await page.goto(`${URL}/`)
await page.evaluate(async () => {
  const put = async (cacheName, url, mb) => {
    const c = await caches.open(cacheName)
    await c.put(url, new Response(new Uint8Array(mb * 1e6), { headers: { 'content-length': String(mb * 1e6) } }))
  }
  const hf = (repo, f) => `https://huggingface.co/onnx-community/${repo}/resolve/main/${f}`
  for (const [repo, mb] of [['whisper-tiny.en', 15], ['whisper-base.en', 35]]) {
    await put('transformers-cache', hf(repo, 'onnx/encoder_model_quantized.onnx'), mb)
    await put('transformers-cache', hf(repo, 'onnx/decoder_model_merged_quantized.onnx'), mb)
    await put('transformers-cache', hf(repo, 'tokenizer.json'), 0)
  }
  await put('transformers-cache', `${location.origin}/ort/ort-wasm-simd-threaded.wasm`, 10)
  await put('ort-runtime', `${location.origin}/ort/ort-wasm-simd-threaded.wasm`, 10)
})

await page.goto(`${URL}/settings`)
const storage = page.getByTestId('voice-storage')
await storage.waitFor({ timeout: 10000 }).catch(() => fail('storage section not shown', browser))
await page.waitForTimeout(500)
const text = await storage.innerText()
console.log(text.replace(/\n+/g, ' | '))
if (!/Tiny \(English\)[\s\S]*30 MB[\s\S]*in use/.test(text)) await fail('tiny row missing size or "in use"', browser)
if (!/Base \(English\)[\s\S]*70 MB/.test(text)) await fail('base row missing size', browser)
if (!/Speech engine[\s\S]*20 MB/.test(text)) await fail('runtime row missing', browser)
if (process.env.SHOT_DIR) { await storage.scrollIntoViewIfNeeded(); await storage.screenshot({ path: `${process.env.SHOT_DIR}/storage.png` }) }

// Delete the model not in use: tiny and the runtime stay.
await page.getByTestId('voice-storage-base.en').getByRole('button', { name: 'Delete' }).click()
const dlg = page.getByRole('dialog')
if (!/Frees about 70 MB/.test(await dlg.innerText())) await fail('dialog does not say 70 MB', browser)
if (process.env.SHOT_DIR) { await page.waitForTimeout(500); await page.screenshot({ path: `${process.env.SHOT_DIR}/confirm.png` }) }
await page.getByTestId('confirm-delete-model').click()
await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 5000 }).catch(() => fail('dialog did not close', browser))
await page.getByTestId('voice-storage-base.en').waitFor({ state: 'detached', timeout: 5000 }).catch(() => fail('base row still shown', browser))
let left = await page.evaluate(async () => (await (await caches.open('transformers-cache')).keys()).map((r) => r.url))
if (left.some((u) => u.includes('whisper-base.en'))) await fail('base files still cached', browser)
if (!left.some((u) => u.includes('/ort/'))) await fail('runtime removed too early', browser)

// Delete the last model: the runtime goes too, from both caches.
await page.getByTestId('voice-storage-tiny.en').getByRole('button', { name: 'Delete' }).click()
if (!/Frees about 50 MB/.test(await page.getByRole('dialog').innerText())) await fail('dialog does not include the runtime', browser)
await page.getByTestId('confirm-delete-model').click()
await storage.waitFor({ state: 'detached', timeout: 5000 }).catch(() => fail('storage section still shown', browser))
await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 5000 }).catch(() => fail('dialog did not close', browser))
left = await page.evaluate(async () => {
  const out = []
  for (const n of await caches.keys()) out.push(...(await (await caches.open(n)).keys()).map((r) => r.url))
  return out.filter((u) => u.includes('whisper') || u.includes('/ort/'))
})
if (left.length) await fail(`files left: ${left.join(', ')}`, browser)
if (!(await page.getByText('Not downloaded.', { exact: false }).count())) await fail('status not reset', browser)
if (errors.length) await fail(`page errors: ${errors.join('; ')}`, browser)

console.log('PASS: voice storage list and delete')
await browser.close()
server.kill()
