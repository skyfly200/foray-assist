// Run: node --experimental-strip-types --test tests/audio.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { resample, mixToMono, rms, Chunker, joinTranscript, cleanTranscript, describeMicError, isRetryableMicError, ortVariantSuffix } from '../utils/audio.ts'

const tone = (n, amp = 0.3) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin(i * 0.2))
const quiet = (n) => new Float32Array(n)
const cat = (...a) => { const o = new Float32Array(a.reduce((s, x) => s + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length } return o }

test('mixToMono averages channels', () => {
  const m = mixToMono([Float32Array.of(1, 0), Float32Array.of(0, 1)])
  assert.deepEqual(Array.from(m), [0.5, 0.5])
})

test('resample length and identity', () => {
  const x = tone(48000)
  assert.equal(resample(x, 48000, 16000).length, 16000)
  assert.equal(resample(x, 16000, 16000), x)
  assert.equal(resample(tone(44100), 44100, 16000).length, 16000)
  assert.equal(resample(tone(8000), 8000, 16000).length, 16000)
})

test('resample preserves DC and amplitude roughly', () => {
  const dc = new Float32Array(48000).fill(0.5)
  const r = resample(dc, 48000, 16000)
  assert.ok(Math.abs(rms(r) - 0.5) < 1e-3)
})

test('Chunker splits on pause without overlap', () => {
  const c = new Chunker()
  const out = c.push(cat(tone(16000 * 4), quiet(16000 * 0.6)))
  assert.equal(out.length, 1)
  assert.equal(out[0].length, 16000 * 4 + 9600)
  assert.equal(c.buffered, 0)
})

test('Chunker forces split at maxSec with overlap', () => {
  const c = new Chunker()
  const out = c.push(tone(16000 * 13))
  assert.equal(out.length, 1)
  assert.equal(out[0].length, 16000 * 12)
  assert.equal(c.buffered, 16000 * 1 + Math.round(0.6 * 16000))
})

test('Chunker waits below minSec, drops silence, flushes remainder', () => {
  const c = new Chunker()
  assert.equal(c.push(tone(16000)).length, 0)
  assert.equal(c.flush().length, 1)
  const s = new Chunker()
  assert.equal(s.push(quiet(16000 * 5)).length, 0)
  assert.equal(s.flush().length, 0)
})

test('Chunker handles small frames', () => {
  const c = new Chunker()
  let n = 0
  for (let i = 0; i < 100; i++) n += c.push(tone(2048)).length
  assert.ok(n >= 1)
})

test('joinTranscript dedupes overlap', () => {
  assert.equal(joinTranscript('found a big bolete under', 'under the oak tree'), 'found a big bolete under the oak tree')
  assert.equal(joinTranscript('Cap is red.', 'Stem is white.'), 'Cap is red. Stem is white.')
  assert.equal(joinTranscript('', 'hi'), 'hi')
  assert.equal(joinTranscript('The cap, is', 'the cap is red'), 'The cap, is red')
})

test('cleanTranscript strips tags', () => {
  assert.equal(cleanTranscript(' [BLANK_AUDIO] hello (music) world *sigh* '), 'hello world')
})

test('describeMicError distinguishes causes', () => {
  assert.equal(describeMicError({ name: 'NotAllowedError' }).kind, 'permission')
  assert.equal(describeMicError({ name: 'NotFoundError' }).kind, 'no-mic')
  const r = describeMicError({ name: 'NotReadableError', message: 'Could not start audio source' })
  assert.equal(r.kind, 'in-use')
  assert.equal(r.message, 'Another app or browser tab is using the microphone. Close it and try again.')
  assert.equal(describeMicError(new Error('boom')).kind, 'other')
})

test('isRetryableMicError', () => {
  for (const n of ['NotReadableError', 'OverconstrainedError', 'AbortError']) assert.ok(isRetryableMicError({ name: n }))
  assert.ok(!isRetryableMicError({ name: 'NotAllowedError' }))
  assert.ok(!isRetryableMicError({ name: 'NotFoundError' }))
})

test('ortVariantSuffix picks asyncify except old Safari without WebGPU', () => {
  const safari18 = 'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15'
  const chrome = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36'
  assert.equal(ortVariantSuffix(safari18, false), '')
  assert.equal(ortVariantSuffix(safari18, true), '.asyncify')
  assert.equal(ortVariantSuffix(chrome, false), '.asyncify')
  assert.equal(ortVariantSuffix('', false), '.asyncify')
})
