// Run: node --experimental-strip-types --test tests/phototags.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { askableFields, buildTagPrompt, parseTagAnswer, PHOTO_FIELDS } from '../utils/photoTags.ts'

test('only asks about empty, visible fields a photo can show', () => {
  const keys = askableFields({ capShape: 'flat', capColor: '  ', odor: '' }, new Set(['capShape', 'capColor', 'gillColor', 'odor']))
  assert.deepEqual(keys, ['capColor', 'gillColor'])
  assert.ok(!PHOTO_FIELDS.includes('speciesGuess'))
  assert.ok(!PHOTO_FIELDS.includes('odor'))
})

test('prompt lists the quick picks for each field', () => {
  const p = buildTagPrompt(['capShape', 'capColor'])
  assert.match(p, /capShape \(Cap shape\): one of convex, flat/)
  assert.match(p, /capColor \(Cap color\): a few words/)
  assert.doesNotMatch(p, /gillColor/)
})

test('reads JSON wrapped in fences and words', () => {
  const ans = 'Sure!\n```json\n{"capShape": "Convex", "capColor": "orange-brown", "odor": "anise"}\n```'
  assert.deepEqual(parseTagAnswer(ans, ['capShape', 'capColor']), [
    { key: 'capShape', label: 'Cap shape', value: 'convex' },
    { key: 'capColor', label: 'Cap color', value: 'orange-brown' },
  ])
})

test('drops unsure answers, unasked keys and junk', () => {
  assert.deepEqual(parseTagAnswer('{"capShape": "unknown", "gillColor": ""}', ['capShape', 'gillColor']), [])
  assert.deepEqual(parseTagAnswer('no idea', ['capShape']), [])
  assert.deepEqual(parseTagAnswer('{"capShape": "flat"', ['capShape']), [])
})

test('maps near answers onto the quick picks, keeps braces inside strings', () => {
  const r = parseTagAnswer('{"gillAttachment": "slightly decurrent", "stemFeatures": ["ring", "bulbous base"], "capColor": "red {ish}"}', ['gillAttachment', 'stemFeatures', 'capColor'])
  assert.deepEqual(r.map((s) => s.value), ['decurrent', 'ring, bulbous base', 'red {ish}'])
})
