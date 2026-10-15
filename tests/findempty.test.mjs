// Run: node --experimental-strip-types --test tests/findempty.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { hasFieldNotes, isEmptyFind, mergeFieldNotes } from '../utils/findEmpty.ts'

const none = { photos: 0, voiceNotes: 0, comments: 0 }

test('a find with nothing on it is empty', () => {
  assert.equal(isEmptyFind({ fieldNotes: {} }, none), true)
  assert.equal(isEmptyFind({}, { photos: 0, voiceNotes: 0 }), true)
})

test('blank or whitespace notes still count as empty', () => {
  assert.equal(hasFieldNotes({ habitat: '  ', notes: '' }), false)
  assert.equal(isEmptyFind({ fieldNotes: { habitat: ' ' } }, none), true)
})

test('anything recorded makes a find non-empty', () => {
  assert.equal(isEmptyFind({ fieldNotes: {} }, { ...none, photos: 1 }), false)
  assert.equal(isEmptyFind({ fieldNotes: {} }, { ...none, voiceNotes: 1 }), false)
  assert.equal(isEmptyFind({ fieldNotes: {} }, { ...none, comments: 2 }), false)
  assert.equal(isEmptyFind({ fieldNotes: { speciesGuess: 'Amanita' } }, none), false)
  assert.equal(isEmptyFind({ fieldNotes: { x_lot: '4' } }, none), false)
  assert.equal(isEmptyFind({ fieldNotes: {}, voucherId: 'UABCDEFGH' }, none), false)
  assert.equal(isEmptyFind({ fieldNotes: {}, iNatObservationId: 12 }, none), false)
})

test('merge: target wins, source fills gaps, conflicts land in notes', () => {
  const m = mergeFieldNotes(
    { speciesGuess: 'Amanita muscaria', habitat: '', notes: 'by the creek' },
    { speciesGuess: 'Amanita', habitat: 'mixed conifer', odor: 'radish', notes: 'second cap' },
    (k) => ({ speciesGuess: 'Species' })[k] ?? k,
  )
  assert.equal(m.speciesGuess, 'Amanita muscaria')
  assert.equal(m.habitat, 'mixed conifer')
  assert.equal(m.odor, 'radish')
  assert.equal(m.notes, 'by the creek\nSpecies: Amanita\nsecond cap')
})

test('merge: identical values are not repeated', () => {
  const m = mergeFieldNotes({ speciesGuess: 'Boletus' }, { speciesGuess: ' Boletus ' })
  assert.deepEqual(m, { speciesGuess: 'Boletus' })
})
