import test from 'node:test'
import assert from 'node:assert/strict'
import { clusterPhotos, haversineMeters } from '../utils/cluster.ts'

const T0 = Date.parse('2026-10-05T10:00:00Z')
const at = (s) => new Date(T0 + s * 1000).toISOString()
const DLAT = 1 / 111195 // ~1 m north

test('haversine ~1m per DLAT', () => {
  assert.ok(Math.abs(haversineMeters(47, -121, 47 + DLAT, -121) - 1) < 0.05)
})
test('time gap splits, sorted regardless of input order', () => {
  const r = clusterPhotos([
    { id: 'c', capturedAt: at(400) },
    { id: 'a', capturedAt: at(0) },
    { id: 'b', capturedAt: at(100) },
  ])
  assert.deepEqual(r, [['a', 'b'], ['c']])
})
test('chain: each within 120s of previous joins', () => {
  const r = clusterPhotos([0, 100, 200, 300].map((s, i) => ({ id: 'p' + i, capturedAt: at(s) })))
  assert.equal(r.length, 1)
})
test('distance splits when both have GPS', () => {
  const r = clusterPhotos([
    { id: 'a', capturedAt: at(0), latitude: 47, longitude: -121 },
    { id: 'b', capturedAt: at(10), latitude: 47 + 3 * DLAT, longitude: -121 },
    { id: 'c', capturedAt: at(20), latitude: 47 + 30 * DLAT, longitude: -121 },
  ])
  assert.deepEqual(r, [['a', 'b'], ['c']])
})
test('missing GPS joins by time', () => {
  const r = clusterPhotos([
    { id: 'a', capturedAt: at(0), latitude: 47, longitude: -121 },
    { id: 'b', capturedAt: at(10) },
    { id: 'c', capturedAt: at(20), latitude: 47 + 2 * DLAT, longitude: -121 },
  ])
  assert.deepEqual(r, [['a', 'b', 'c']])
})
test('options and empty input, deterministic ties', () => {
  assert.deepEqual(clusterPhotos([]), [])
  const r = clusterPhotos([{ id: 'z', capturedAt: at(0) }, { id: 'y', capturedAt: at(0) }, { id: 'x', capturedAt: at(30) }], { maxSeconds: 20 })
  assert.deepEqual(r, [['y', 'z'], ['x']])
})
test('invalid time never merges', () => {
  const r = clusterPhotos([{ id: 'a', capturedAt: 'nope' }, { id: 'b', capturedAt: 'bad' }, { id: 'c', capturedAt: at(0) }])
  assert.deepEqual(r, [['c'], ['a'], ['b']])
})
