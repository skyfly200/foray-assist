// TSPL encoder (pure). In TSPL BITMAP mode 0, a 0 bit is a black dot, so we invert MonoBitmap.
import type { MonoBitmap } from './label.ts'
import { concat } from './escpos.ts'

const enc = (s: string) => new TextEncoder().encode(s)

export function tsplHeader(widthMm: number, heightMm: number, gapMm = 2): string {
  return `SIZE ${widthMm} mm,${heightMm} mm\r\nGAP ${gapMm} mm,0 mm\r\nDIRECTION 1\r\nCLS\r\n`
}

export function tsplBitmapCommand(b: MonoBitmap, x = 0, y = 0): string {
  return `BITMAP ${x},${y},${b.bytesPerRow},${b.height},0,`
}

export function invertBits(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length)
  for (let i = 0; i < data.length; i++) out[i] = ~data[i] & 0xff
  return out
}

export function encodeTspl(
  b: MonoBitmap,
  opts: { widthMm?: number; heightMm?: number; gapMm?: number; copies?: number } = {},
): Uint8Array {
  return concat([
    enc(tsplHeader(opts.widthMm ?? 50, opts.heightMm ?? 30, opts.gapMm ?? 2)),
    enc(tsplBitmapCommand(b)),
    invertBits(b.data),
    enc(`\r\nPRINT ${opts.copies ?? 1},1\r\n`),
  ])
}
