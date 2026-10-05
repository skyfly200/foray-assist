// On-device blur score: variance of the 3x3 Laplacian of the grayscale image,
// computed at a fixed working size so scores are comparable. Higher = sharper.
// Math is pure (testable in node); `scoreBitmap` needs canvas and runs in the
// blur worker (or on the main thread as a fallback).

export const WORKING_EDGE = 512

/** Fit (w,h) so the long edge is at most `maxEdge` (never upscales). */
export function fitSize(w: number, h: number, maxEdge = WORKING_EDGE): { width: number; height: number } {
  const long = Math.max(w, h)
  if (long <= maxEdge || long <= 0) return { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) }
  const s = maxEdge / long
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) }
}

/** RGBA bytes -> luma (Rec. 601) Float32Array of w*h. */
export function rgbaToGray(rgba: ArrayLike<number>, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height)
  for (let i = 0, j = 0; i < out.length; i++, j += 4) {
    out[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2]
  }
  return out
}

/** Variance of the 4-neighbour Laplacian (kernel 0 1 0 / 1 -4 1 / 0 1 0) over interior pixels. Flat image => 0. */
export function laplacianVariance(gray: ArrayLike<number>, width: number, height: number): number {
  if (width < 3 || height < 3) return 0
  let sum = 0
  let sumSq = 0
  let n = 0
  for (let y = 1; y < height - 1; y++) {
    const row = y * width
    for (let x = 1; x < width - 1; x++) {
      const i = row + x
      const l = gray[i - 1] + gray[i + 1] + gray[i - width] + gray[i + width] - 4 * gray[i]
      sum += l
      sumSq += l * l
      n++
    }
  }
  const mean = sum / n
  return Math.max(0, sumSq / n - mean * mean)
}

export function scoreRgba(rgba: ArrayLike<number>, width: number, height: number): number {
  return laplacianVariance(rgbaToGray(rgba, width, height), width, height)
}

/** Draw an ImageBitmap at working size and score it. Browser/worker only. */
export function scoreBitmap(bitmap: { width: number; height: number }, maxEdge = WORKING_EDGE): number {
  const { width, height } = fitSize(bitmap.width, bitmap.height, maxEdge)
  const g: any = globalThis
  const canvas = typeof g.OffscreenCanvas !== 'undefined' ? new g.OffscreenCanvas(width, height) : Object.assign(g.document.createElement('canvas'), { width, height })
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2d canvas unavailable')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, width, height)
  const data = ctx.getImageData(0, 0, width, height).data
  return scoreRgba(data, width, height)
}
