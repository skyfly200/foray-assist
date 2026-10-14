// Run: node --experimental-strip-types --test tests/capture.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { pickCaptureForay } from '../utils/captureTarget.ts'

const f = (id, day, endedAt) => ({ id, startedAt: `2026-10-${String(day).padStart(2, '0')}T10:00:00Z`, endedAt })

test('the foray on screen wins, even if it has ended', () => {
  assert.equal(pickCaptureForay([f('a', 1, '2026-10-01T12:00:00Z'), f('b', 5)], 'a'), 'a')
})

test('otherwise the newest foray still in progress', () => {
  assert.equal(pickCaptureForay([f('a', 1), f('b', 5), f('c', 9, '2026-10-09T12:00:00Z')]), 'b')
})

test('an unknown current id falls back to the newest open foray', () => {
  assert.equal(pickCaptureForay([f('a', 1)], 'gone'), 'a')
})

test('null when every foray has ended or there are none', () => {
  assert.equal(pickCaptureForay([f('a', 1, '2026-10-01T12:00:00Z')]), null)
  assert.equal(pickCaptureForay([]), null)
})
