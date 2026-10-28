// Run: node --experimental-strip-types --test tests/findmap.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { mapPoints, missingFixes } from '../utils/findMap.ts'

const find = (id, forayId, day, lat, lng, speciesGuess) => ({
  id, forayId, specimenId: id, timestamp: `2026-10-${String(day).padStart(2, '0')}T10:00:00Z`, latitude: lat, longitude: lng, fieldNotes: { speciesGuess },
})
const peer = (id, forayId, day, lat, lng, geoprivacy = 'open') => ({
  id, forayId, authorName: 'Ana', specimenId: `P-${id}`, timestamp: `2026-10-${String(day).padStart(2, '0')}T10:00:00Z`, latitude: lat, longitude: lng, geoprivacy, fieldNotes: { speciesGuess: 'Chanterelle' },
})
const photo = (specimenRowId, capturedAt, lat, lng) => ({ specimenRowId, capturedAt, latitude: lat, longitude: lng })

test('only finds with a real GPS fix get a pin, newest first', () => {
  const pts = mapPoints({
    finds: [find('a', 'f1', 1, 47.5, -121.8, 'Amanita muscaria'), find('b', 'f1', 3, undefined, undefined), find('c', 'f2', 2, 0, 0), find('d', 'f2', 4, 47.6, -121.9), find('e', 'f2', 5, 120, 10)],
    forayNames: { f1: 'Tiger Mountain' },
  })
  assert.deepEqual(pts.map((p) => p.id), ['d', 'a'])
  assert.equal(pts[1].title, 'Amanita muscaria')
  assert.equal(pts[1].forayName, 'Tiger Mountain')
  assert.equal(pts[1].source, 'mine')
  assert.equal(pts[0].title, 'Unidentified find')
  assert.equal(pts[0].forayName, 'Foray')
})

test('filters to one foray', () => {
  const pts = mapPoints({ finds: [find('a', 'f1', 1, 47.5, -121.8), find('d', 'f2', 4, 47.6, -121.9)], forayNames: {}, forayId: 'f2' })
  assert.deepEqual(pts.map((p) => p.id), ['d'])
})

test('a find with no GPS of its own uses its first photo that has GPS', () => {
  const pts = mapPoints({
    finds: [find('a', 'f1', 1, undefined, undefined, 'Boletus'), find('b', 'f1', 2, 47.5, -121.8)],
    photos: [photo('a', '2026-10-01T10:05:00Z', 47.7, -121.7), photo('a', '2026-10-01T10:00:00Z', 47.6, -121.6), photo('b', '2026-10-02T10:00:00Z', 1, 1)],
    forayNames: {},
  })
  const a = pts.find((p) => p.id === 'a')
  assert.deepEqual([a.lat, a.lng], [47.6, -121.6])
  // The find's own fix wins over its photos.
  assert.deepEqual([pts.find((p) => p.id === 'b').lat, pts.find((p) => p.id === 'b').lng], [47.5, -121.8])
})

test('other members finds show at the precision their author chose', () => {
  const pts = mapPoints({
    finds: [],
    peers: [peer('x', 'f1', 1, 47.56789, -121.83456, 'open'), peer('y', 'f1', 2, 47.56789, -121.83456, 'obscured'), peer('z', 'f1', 3, 47.56789, -121.83456, 'private')],
    forayNames: { f1: 'Tiger Mountain' },
  })
  assert.deepEqual(pts.map((p) => p.id), ['y', 'x'])
  assert.deepEqual([pts[0].lat, pts[0].lng], [47.6, -121.8])
  assert.deepEqual([pts[1].lat, pts[1].lng], [47.56789, -121.83456])
  assert.equal(pts[0].source, 'peer')
  assert.equal(pts[0].author, 'Ana')
  assert.equal(pts[0].title, 'Chanterelle')
})

test('a shared find that came back as our own row is plotted once, as ours', () => {
  const own = find('a', 'f1', 1, 47.5, -121.8, 'Amanita')
  const pts = mapPoints({ finds: [own], peers: [peer('a', 'f1', 1, 47.5, -121.8)], forayNames: {} })
  assert.equal(pts.length, 1)
  assert.equal(pts[0].source, 'mine')
})

test('peer finds respect the foray filter', () => {
  const pts = mapPoints({ finds: [], peers: [peer('x', 'f1', 1, 47, -121), peer('y', 'f2', 2, 48, -122)], forayNames: {}, forayId: 'f2' })
  assert.deepEqual(pts.map((p) => p.id), ['y'])
})

test('missingFixes counts own finds with no location, after photo fallback', () => {
  const finds = [find('a', 'f1', 1), find('b', 'f1', 2, 47, -121), find('c', 'f2', 3)]
  assert.equal(missingFixes(finds, [photo('a', '2026-10-01T10:00:00Z', 47, -121)], null), 1)
  assert.equal(missingFixes(finds, [], 'f2'), 1)
})
