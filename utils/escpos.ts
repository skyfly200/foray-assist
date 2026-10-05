// ESC/POS raster encoder (pure). Bitmap: 1 = black, MSB first (matches MonoBitmap).
import type { MonoBitmap } from './label.ts'

const ESC = 0x1b, GS = 0x1d

/** GS v 0 raster image block (m=0 normal density). */
export function gsV0(b: MonoBitmap, mode = 0): Uint8Array {
  const xL = b.bytesPerRow & 0xff, xH = (b.bytesPerRow >> 8) & 0xff
  const yL = b.height & 0xff, yH = (b.height >> 8) & 0xff
  const out = new Uint8Array(8 + b.data.length)
  out.set([GS, 0x76, 0x30, mode, xL, xH, yL, yH], 0)
  out.set(b.data, 8)
  return out
}

/** ESC @ (init) + raster + `feedLines` x LF. */
export function encodeEscPos(b: MonoBitmap, opts: { feedLines?: number; init?: boolean } = {}): Uint8Array {
  const parts: Uint8Array[] = []
  if (opts.init !== false) parts.push(new Uint8Array([ESC, 0x40]))
  parts.push(gsV0(b))
  parts.push(new Uint8Array(Array(opts.feedLines ?? 2).fill(0x0a)))
  return concat(parts)
}

export function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}
