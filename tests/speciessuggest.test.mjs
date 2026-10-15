// Run: node --experimental-strip-types --test tests/speciessuggest.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { rankPastNames, suggestSpecies } from '../utils/speciesSuggest.ts'

const names = (q, o) => suggestSpecies(q, o).map((s) => s.name)

test('empty query gives nothing', () => {
  assert.deepEqual(suggestSpecies('  '), [])
})

test('prefix of the built-in list', () => {
  const r = names('amanita m')
  assert.ok(r.includes('Amanita muscaria'))
  assert.ok(r.every((n) => n.toLowerCase().startsWith('amanita m')))
})

test('epithet and abbreviated genus', () => {
  assert.equal(names('muscar')[0], 'Amanita muscaria')
  assert.equal(names('A. musc')[0], 'Amanita muscaria')
  assert.equal(names('c cib')[0], 'Cantharellus cibarius')
})

test('past finds come first, with counts, and win over the list', () => {
  const past = rankPastNames([
    { name: 'Amanita muscaria var. guessowii', at: 1 },
    { name: 'amanita  muscaria var. guessowii?', at: 2 },
    { name: 'Russula paludosa', at: 3 },
  ])
  assert.deepEqual(past[0], { name: 'amanita muscaria var. guessowii', count: 2 })
  const r = suggestSpecies('amanita', { past })
  assert.equal(r[0].source, 'past')
  assert.equal(r[0].count, 2)
  // Past name also in the list is shown once, as a past find.
  const r2 = suggestSpecies('boletus ed', { past: [{ name: 'Boletus edulis', count: 3 }] })
  assert.equal(r2.filter((s) => s.name === 'Boletus edulis').length, 1)
  assert.equal(r2[0].source, 'past')
})

test('custom word list ranks above the list', () => {
  const r = suggestSpecies('russula p', { custom: ['Russula paludosa'] })
  assert.equal(r[0].name, 'Russula paludosa')
  assert.equal(r[0].source, 'custom')
})

test('common names map to Latin', () => {
  const r = suggestSpecies('chanter')
  assert.equal(r[0].name, 'Cantharellus cibarius')
  assert.match(r[0].common, /chanterelle/)
  assert.ok(names('lion').includes('Hericium erinaceus'))
  assert.ok(names('turkey').includes('Trametes versicolor'))
})

test('typos still match', () => {
  assert.ok(names('cantarellus').includes('Cantharellus cibarius'))
  assert.ok(names('hericium erinacious').includes('Hericium erinaceus'))
})

test('limit and no echo of an exact single match', () => {
  assert.equal(suggestSpecies('a', { limit: 4 }).length, 4)
  assert.deepEqual(suggestSpecies('Laetiporus sulphureus'), [])
})
