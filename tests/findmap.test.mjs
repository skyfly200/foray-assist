// Run: node --experimental-strip-types --test tests/findmap.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { mapPoints } from '../utils/findMap.ts'

const find = (id, forayId, day, lat, lng, speciesGuess) => ({
  id, forayId, specimenId: id, timestamp: `2026-10-${String(day).padStart(2, '0')}T10:00:00Z`, latitude: lat, longitude: lng, fieldNotes: { speciesGuess },
})

test('only finds with a real GPS fix get a pin, newest first', () => {
  const pts = mapPoints(
    [find('a', 'f1', 1, 47.5, -121.8, 'Amanita muscaria'), find('b', 'f1', 3, undefined, undefined), find('c', 'f2', 2, 0, 0), find('d', 'f2', 4, 47.6, -121.9), find('e', 'f2', 5, 120, 10)],
    { f1: 'Tiger Mountain' },
  )
  assert.deepEqual(pts.map((p) => p.id), ['d', 'a'])
  assert.equal(pts[1].title, 'Amanita muscaria')
  assert.equal(pts[1].forayName, 'Tiger Mountain')
  assert.equal(pts[0].title, 'Unidentified find')
  assert.equal(pts[0].forayName, 'Foray')
})

test('filters to one foray', () => {
  const pts = mapPoints([find('a', 'f1', 1, 47.5, -121.8), find('d', 'f2', 4, 47.6, -121.9)], {}, 'f2')
  assert.deepEqual(pts.map((p) => p.id), ['d'])
})
