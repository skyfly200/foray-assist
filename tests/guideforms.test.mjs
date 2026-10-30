// Run: node --experimental-strip-types --test tests/guideforms.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { MUSHROOM_FORMS, SHOT_ANGLES, FORM_IDS, GENERIC_SHOTS, formById, shotsFor, anglesFor } from '../utils/guideForms.ts'

test('every form has unique ids and its shots use only known angles, once each, in order', () => {
  assert.equal(new Set(FORM_IDS).size, FORM_IDS.length)
  for (const f of MUSHROOM_FORMS) {
    const angles = f.shots.map((s) => s.angle)
    assert.equal(new Set(angles).size, angles.length, `${f.id} repeats a shot`)
    for (const a of angles) assert.ok(SHOT_ANGLES.includes(a), `${f.id} has unknown shot ${a}`)
    // Keep the order of the generic list, so the chips read the same from form to form.
    const order = SHOT_ANGLES.filter((a) => angles.includes(a))
    assert.deepEqual(angles, order, `${f.id} is out of order`)
    for (const s of f.shots) assert.ok(s.label && s.hint && s.icon, `${f.id}/${s.angle} is missing text`)
  }
})

test('a gilled mushroom gets cap, gills, stipe with base, and habitat', () => {
  assert.deepEqual(anglesFor('gilled'), ['cap', 'underside', 'stem', 'habitat'])
  assert.match(formById('gilled').tip, /volva|bulb/)
})

test('forms without a stipe have no stem shot', () => {
  for (const id of ['polypore', 'crust', 'jelly']) assert.equal(anglesFor(id).includes('stem'), false, id)
})

test('the other form and an unknown form use the generic four shots', () => {
  assert.deepEqual(shotsFor('other'), GENERIC_SHOTS)
  assert.deepEqual(shotsFor(undefined), GENERIC_SHOTS)
  assert.deepEqual(shotsFor('not-a-form'), GENERIC_SHOTS)
})

test('every form has a short chip name and a tip', () => {
  for (const f of MUSHROOM_FORMS) {
    assert.ok(f.short && f.short.length <= 12, `${f.id} short name`)
    assert.ok(f.tip.length > 20, `${f.id} tip`)
  }
})
