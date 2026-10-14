// Run: node --experimental-strip-types --test tests/dex.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDex, dexNo, taxonKey } from '../utils/dex.ts'

const find = (id, forayId, day, speciesGuess) => ({ id, forayId, timestamp: `2026-10-${String(day).padStart(2, '0')}T10:00:00Z`, speciesGuess })

test('taxonKey ignores case, spacing and a trailing ?', () => {
  assert.equal(taxonKey('  Amanita   Muscaria? '), 'amanita muscaria')
  assert.equal(taxonKey(undefined), '')
})

test('groups finds per species, numbered by first sighting', () => {
  const { entries, stats } = buildDex(
    [
      find('a', 'f1', 5, 'Amanita muscaria'),
      find('b', 'f2', 9, 'amanita muscaria'),
      find('c', 'f1', 3, 'Russula emetica'),
      find('d', 'f2', 8, 'Amanita muscaria'),
      find('e', 'f2', 8, ''),
      find('g', 'f2', 8),
    ],
    { f1: 'Old growth loop', f2: 'Creek trail' },
  )
  assert.deepEqual(entries.map((e) => [e.number, e.name, e.count]), [
    [1, 'Russula emetica', 1],
    [2, 'Amanita muscaria', 3],
  ])
  const am = entries[1]
  assert.equal(am.first.findId, 'a')
  assert.equal(am.first.forayName, 'Old growth loop')
  assert.equal(am.last.findId, 'b')
  assert.equal(am.forayCount, 2)
  assert.deepEqual(am.sightings.map((s) => s.findId), ['b', 'd', 'a'])
  assert.equal(stats.species, 2)
  assert.equal(stats.genera, 2)
  assert.equal(stats.finds, 6)
  assert.equal(stats.unidentified, 2)
  assert.equal(stats.forays, 2)
  assert.deepEqual(stats.mostFound, { name: 'Amanita muscaria', count: 3 })
  assert.equal(stats.newest.name, 'Amanita muscaria')
})

test('empty input', () => {
  const { entries, stats } = buildDex([])
  assert.equal(entries.length, 0)
  assert.equal(stats.species, 0)
  assert.equal(stats.mostFound, undefined)
})

test('dexNo pads to three digits', () => {
  assert.equal(dexNo(7), '#007')
  assert.equal(dexNo(1234), '#1234')
})
