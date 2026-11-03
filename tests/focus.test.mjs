// Run: node --experimental-strip-types --test tests/focus.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { focusPoint } from '../utils/focusPoint.ts'

// A landscape 1920x1080 frame shown in a portrait 400x800 box: it is scaled to 0.74 and
// cropped left and right, so the box shows the middle of the frame.
const box = { width: 400, height: 800 }
const frame = { width: 1920, height: 1080 }

test('the centre of the box is the centre of the frame', () => {
  assert.deepEqual(focusPoint({ x: 200, y: 400 }, box, frame), { x: 0.5, y: 0.5 })
})

test('the cropped left edge maps to the frame, not to 0', () => {
  // The frame shows 1422 px wide, so 511 px of it is cropped off the left.
  const p = focusPoint({ x: 0, y: 400 }, box, frame)
  assert.ok(Math.abs(p.x - 511.1 / 1422.2) < 1e-3)
  assert.equal(p.y, 0.5)
})

test('taps outside the frame are clamped to 0..1', () => {
  assert.deepEqual(focusPoint({ x: -600, y: 900 }, box, frame), { x: 0, y: 1 })
})

test('a frame with the same shape as the box is not cropped', () => {
  assert.deepEqual(focusPoint({ x: 100, y: 50 }, { width: 400, height: 200 }, { width: 800, height: 400 }), { x: 0.25, y: 0.25 })
})
