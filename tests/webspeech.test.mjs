// Run: node --experimental-strip-types --test tests/webspeech.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { speechTakesTrack } from '../composables/useWebSpeech.ts'

test('track input only on engines with the on-device API', () => {
  assert.equal(speechTakesTrack(undefined), false)
  assert.equal(speechTakesTrack(function Old() {}), false)
  const New = function () {}
  New.available = async () => 'available'
  assert.equal(speechTakesTrack(New), true)
  const Mid = function () {}
  Mid.availableOnDevice = async () => 'available'
  assert.equal(speechTakesTrack(Mid), true)
})
