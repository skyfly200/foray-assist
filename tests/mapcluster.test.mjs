// Run: node --experimental-strip-types --test tests/mapcluster.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { clusterPoints, worldPixel } from '../utils/mapCluster.ts'

const pin = (id, lat, lng) => ({ id, specimenId: id, forayId: 'f1', forayName: 'Foray', lat, lng, title: id, at: '2026-10-01T10:00:00Z', source: 'mine' })

test('worldPixel: the equator at zoom 0 is the middle of one 256px tile', () => {
  const { x, y } = worldPixel(0, 0, 0)
  assert.ok(Math.abs(x - 128) < 1e-9)
  assert.ok(Math.abs(y - 128) < 1e-9)
})

test('pins a few metres apart merge at a low zoom', () => {
  const r = clusterPoints([pin('a', 47.6, -121.8), pin('b', 47.60001, -121.80001)], 12)
  assert.equal(r.length, 1)
  assert.equal(r[0].points.length, 2)
  assert.ok(Math.abs(r[0].lat - 47.600005) < 1e-9)
})

test('the same pins split apart when you zoom in', () => {
  const pts = [pin('a', 47.6, -121.8), pin('b', 47.6005, -121.8005)]
  assert.equal(clusterPoints(pts, 10).length, 1)
  assert.equal(clusterPoints(pts, 18).length, 2)
})

test('a lone pin keeps its exact position', () => {
  const r = clusterPoints([pin('a', 47.6123, -121.8456)], 5)
  assert.equal(r.length, 1)
  assert.deepEqual([r[0].lat, r[0].lng], [47.6123, -121.8456])
})

test('far apart pins stay separate at any zoom', () => {
  const r = clusterPoints([pin('a', 47.6, -121.8), pin('b', 40.7, -74.0)], 4)
  assert.equal(r.length, 2)
})
