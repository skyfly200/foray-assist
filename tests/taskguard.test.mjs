import test from 'node:test'
import assert from 'node:assert/strict'
import {
  TimeoutError, withTimeout, stallWatch, transcribeTimeoutMs, errorStatus, retryAfterSeconds, isRateLimited, friendlyError,
} from '../utils/taskGuard.ts'

test('withTimeout: passes through a value that arrives in time', async () => {
  assert.equal(await withTimeout(Promise.resolve(7), 50), 7)
})

test('withTimeout: rejects a hung promise with TimeoutError and runs onTimeout first', async () => {
  let killed = false
  await assert.rejects(
    withTimeout(new Promise(() => {}), 20, 'too slow', () => { killed = true }),
    (e) => e instanceof TimeoutError && e.name === 'TimeoutError' && e.message === 'too slow',
  )
  assert.equal(killed, true)
})

test('stallWatch: fires once after no pokes, never while poked, never after stop', async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  let fired = 0
  const w = stallWatch(40, () => fired++)
  for (let i = 0; i < 4; i++) { await sleep(15); w.poke() }
  assert.equal(fired, 0)
  await sleep(70)
  assert.equal(fired, 1)
  w.poke()
  await sleep(70)
  assert.equal(fired, 1, 'a fired watch stays fired')
  let fired2 = 0
  const w2 = stallWatch(20, () => fired2++)
  w2.stop()
  await sleep(40)
  assert.equal(fired2, 0)
})

test('transcribeTimeoutMs: grows with audio length, has a floor and a cap', () => {
  assert.equal(transcribeTimeoutMs(0), 90_000)
  assert.ok(transcribeTimeoutMs(16000 * 30) > transcribeTimeoutMs(16000 * 5))
  assert.equal(transcribeTimeoutMs(16000 * 3600), 15 * 60_000)
})

test('errorStatus: reads fetch, ofetch, Supabase and Transformers.js shapes', () => {
  assert.equal(errorStatus({ status: 429 }), 429)
  assert.equal(errorStatus({ statusCode: 502 }), 502)
  assert.equal(errorStatus({ response: { status: 503 } }), 503)
  assert.equal(errorStatus({ status: '429' }), 429)
  assert.equal(errorStatus(new Error('Error (429) occurred while trying to load file: "https://huggingface.co/x".')), 429)
  assert.equal(errorStatus(new Error('nope')), undefined)
  assert.equal(errorStatus(null), undefined)
})

test('retryAfterSeconds: seconds or HTTP date', () => {
  assert.equal(retryAfterSeconds('30'), 30)
  assert.equal(retryAfterSeconds(new Date(Date.UTC(2026, 0, 1, 0, 2)).toUTCString(), Date.UTC(2026, 0, 1)), 120)
  assert.equal(retryAfterSeconds(null), undefined)
  assert.equal(retryAfterSeconds('soon'), undefined)
})

test('friendlyError: quota / rate limit says so and names the service', () => {
  assert.ok(isRateLimited({ status: 429 }))
  assert.ok(isRateLimited(new Error('Too Many Requests')))
  assert.ok(isRateLimited(new Error('quota exceeded')))
  assert.ok(!isRateLimited(new Error('Could not locate file')))
  const m = friendlyError({ status: 429 }, 'Hugging Face', 45)
  assert.match(m, /Hugging Face is limiting requests/)
  assert.match(m, /HTTP 429/)
  assert.match(m, /about 45 seconds/)
  assert.match(friendlyError({ status: 429 }, 'iNaturalist', 600), /about 10 minutes/)
  assert.match(friendlyError({ statusCode: 429, statusMessage: 'Too Many Requests' }), /a few minutes/)
})

test('friendlyError: timeouts and network failures point at Retry', () => {
  assert.match(friendlyError(new TimeoutError('Sync request timed out')), /^Sync request timed out\. Press Retry/)
  assert.match(friendlyError(new TypeError('Failed to fetch'), 'iNaturalist'), /Could not reach iNaturalist/)
  assert.equal(friendlyError(new Error('Bad observation id')), 'Bad observation id')
  assert.equal(friendlyError({ data: { statusMessage: 'iNaturalist is not connected' } }), 'iNaturalist is not connected')
})

test('friendlyError: keeps a message an inner layer already worded', () => {
  const inner = friendlyError({ status: 429 }, 'Hugging Face', 120)
  assert.equal(friendlyError(new Error(inner), 'Other'), inner)
})
