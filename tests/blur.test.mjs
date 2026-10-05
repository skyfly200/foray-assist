import test from 'node:test'
import assert from 'node:assert/strict'
import { laplacianVariance, rgbaToGray, fitSize, scoreRgba } from '../utils/blur.ts'

const W = 64
const H = 64
const checker = (cell) => Float32Array.from({ length: W * H }, (_, i) => (((i % W / cell | 0) + ((i / W | 0) / cell | 0)) % 2 ? 255 : 0))
const flat = () => new Float32Array(W * H).fill(128)
function boxBlur(g, r = 1) {
  const o = new Float32Array(g.length)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0, n = 0
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const xx = x + dx, yy = y + dy
      if (xx >= 0 && yy >= 0 && xx < W && yy < H) { s += g[yy * W + xx]; n++ }
    }
    o[y * W + x] = s / n
  }
  return o
}

test('flat = 0, sharp > blurred > flat', () => {
  const sharp = laplacianVariance(checker(1), W, H)
  const blurred = laplacianVariance(boxBlur(checker(1), 2), W, H)
  assert.equal(laplacianVariance(flat(), W, H), 0)
  assert.ok(sharp > blurred && blurred >= 0, `${sharp} ${blurred}`)
  assert.ok(sharp > 10 * blurred)
})
test('more blur lowers score', () => {
  const g = checker(2)
  assert.ok(laplacianVariance(g, W, H) > laplacianVariance(boxBlur(g, 1), W, H))
  assert.ok(laplacianVariance(boxBlur(g, 1), W, H) > laplacianVariance(boxBlur(boxBlur(g, 1), 2), W, H))
})
test('tiny image safe; rgba path matches gray path', () => {
  assert.equal(laplacianVariance([1, 2], 2, 1), 0)
  const g = checker(1)
  const rgba = new Uint8ClampedArray(W * H * 4)
  g.forEach((v, i) => rgba.set([v, v, v, 255], i * 4))
  const gray = rgbaToGray(rgba, W, H)
  assert.ok(Math.abs(gray[1] - g[1]) < 0.5)
  assert.ok(Math.abs(scoreRgba(rgba, W, H) - laplacianVariance(g, W, H)) / laplacianVariance(g, W, H) < 0.01)
})
test('fitSize', () => {
  assert.deepEqual(fitSize(4000, 3000), { width: 512, height: 384 })
  assert.deepEqual(fitSize(300, 200), { width: 300, height: 200 })
})
