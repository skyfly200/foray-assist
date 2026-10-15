// Run: node --experimental-strip-types --test tests/xrmath.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { project } from '../utils/xrMath.ts'

const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
// Simple perspective: clip.w = -z, so points in front (z < 0) are visible.
const P = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, -1, 0, 0, 0, 0]

test('a point straight ahead lands in the middle of the overlay', () => {
  assert.deepEqual(project(P, I, { x: 0, y: 0, z: -1 }, 400, 800), { x: 200, y: 400, visible: true })
})

test('up and right move up and right on screen', () => {
  const s = project(P, I, { x: 0.5, y: 0.5, z: -1 }, 400, 800)
  assert.equal(s.x, 300)
  assert.equal(s.y, 200)
})

test('points behind the camera are hidden', () => {
  assert.equal(project(P, I, { x: 0, y: 0, z: 1 }, 400, 800).visible, false)
})

test('the view matrix moves the world', () => {
  const back = [...I.slice(0, 12), 0, 0, -1, 1] // camera stepped back 1 m
  assert.deepEqual(project(P, back, { x: 0.5, y: 0, z: -1 }, 400, 800), { x: 250, y: 400, visible: true })
})
