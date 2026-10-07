// Pure layout + bitmap helpers for the 50x30 mm specimen tag (SPEC §3.5) at 203 dpi.
// Everything except renderLabelBitmap() is DOM-free and unit tested (tests/label.test.mjs).
// Type-only imports so the file runs under node --experimental-strip-types.
import type { Specimen } from './db.ts'
import { displayId, isPendingId, normalizeId } from './idCode.ts'

export const LABEL_WIDTH_PX = 400 // 50 mm @ 203 dpi (multiple of 8)
export const LABEL_HEIGHT_PX = 240 // 30 mm @ 203 dpi
export const QR_BOX_PX = 120

/** 1-bit bitmap, rows padded to whole bytes, MSB first, bit 1 = black. */
export interface MonoBitmap {
  width: number
  height: number
  bytesPerRow: number
  data: Uint8Array
}

export interface LabelModel {
  header: string
  id: string
  species: string[]
  when: string
  location: string
  substrate: string[]
  notes: string[]
  qr: string
}

export function qrPayload(s: Pick<Specimen, 'specimenId' | 'iNatObservationId'>): string {
  return s.iNatObservationId
    ? `https://www.inaturalist.org/observations/${s.iNatObservationId}`
    : `foray://specimen/${normalizeId(s.specimenId) ?? s.specimenId}`
}

/** Obscured location text. 'private' or missing coords -> ''. Non-open rounds to 0.1 deg. */
export function locationText(s: Pick<Specimen, 'latitude' | 'longitude' | 'geoprivacy'>): string {
  if (s.geoprivacy === 'private') return ''
  if (typeof s.latitude !== 'number' || typeof s.longitude !== 'number') return ''
  const obscure = s.geoprivacy !== 'open'
  const f = (n: number) => (obscure ? (Math.round(n * 10) / 10).toFixed(1) : n.toFixed(5))
  return `${obscure ? '~' : ''}${f(s.latitude)}, ${f(s.longitude)}`
}

const p2 = (n: number) => String(n).padStart(2, '0')
/** Local "YYYY-MM-DD HH:MM". */
export function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`
}

/**
 * Greedy word wrap. `measure` returns the width of a string (default: char count, so
 * maxWidth = max chars). Long words are hard-split. Overflow is truncated with an ellipsis.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  maxLines = Infinity,
  measure: (s: string) => number = (s) => s.length,
): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  const lines: string[] = []
  let cur = ''
  const push = (l: string) => lines.push(l)
  for (let w of words) {
    while (measure(w) > maxWidth && w.length > 1) {
      // hard split an over-long word
      if (cur) { push(cur); cur = '' }
      let n = w.length - 1
      while (n > 1 && measure(w.slice(0, n)) > maxWidth) n--
      push(w.slice(0, n))
      w = w.slice(n)
    }
    const next = cur ? `${cur} ${w}` : w
    if (measure(next) <= maxWidth) cur = next
    else { push(cur); cur = w }
  }
  if (cur) push(cur)
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    let last = kept[maxLines - 1]
    while (last.length > 1 && measure(last + '…') > maxWidth) last = last.slice(0, -1)
    kept[maxLines - 1] = last + '…'
    return kept
  }
  return lines
}

export interface BuildOpts {
  /** Text column width in "units" of `measure` (default 22 chars). */
  maxWidth?: number
  measure?: (s: string) => number
}

export function buildLabelModel(s: Specimen, opts: BuildOpts = {}): LabelModel {
  const w = opts.maxWidth ?? 22
  const m = opts.measure
  const fn = s.fieldNotes ?? {}
  return {
    header: 'FORAY',
    id: displayId(s.specimenId),
    species: fn.speciesGuess ? wrapText(fn.speciesGuess, w, 2, m) : ['(unidentified)'],
    when: formatWhen(s.timestamp),
    location: locationText(s),
    substrate: fn.substrate ? wrapText('Sub: ' + fn.substrate, w, 1, m) : [],
    notes: fn.notes ? wrapText(fn.notes, w, 3, m) : [],
    qr: qrPayload(s),
  }
}

/** Pack row-major luminance (0..255, one byte per pixel) into a 1-bit bitmap. black if lum < threshold. */
export function packLuminance(lum: ArrayLike<number>, width: number, height: number, threshold = 128): MonoBitmap {
  const bytesPerRow = Math.ceil(width / 8)
  const data = new Uint8Array(bytesPerRow * height)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (lum[y * width + x] < threshold) data[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7)
  return { width, height, bytesPerRow, data }
}

/** RGBA (alpha composited over white) -> luminance. */
export function rgbaToLuminance(rgba: ArrayLike<number>, width: number, height: number): Float32Array {
  const lum = new Float32Array(width * height)
  for (let i = 0; i < lum.length; i++) {
    const a = rgba[i * 4 + 3] / 255
    const y = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]
    lum[i] = y * a + 255 * (1 - a)
  }
  return lum
}

/** Floyd–Steinberg dither then pack. Use for photos; threshold is crisper for text/QR. */
export function ditherToBitmap(lum: ArrayLike<number>, width: number, height: number): MonoBitmap {
  const buf = Float32Array.from(lum as ArrayLike<number> as number[])
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const old = buf[i]
      const nv = old < 128 ? 0 : 255
      buf[i] = nv
      const err = old - nv
      if (x + 1 < width) buf[i + 1] += (err * 7) / 16
      if (y + 1 < height) {
        if (x > 0) buf[i + width - 1] += (err * 3) / 16
        buf[i + width] += (err * 5) / 16
        if (x + 1 < width) buf[i + width + 1] += err / 16
      }
    }
  return packLuminance(buf, width, height, 128)
}

export function rgbaToBitmap(
  rgba: ArrayLike<number>, width: number, height: number,
  opts: { dither?: boolean; threshold?: number } = {},
): MonoBitmap {
  const lum = rgbaToLuminance(rgba, width, height)
  return opts.dither ? ditherToBitmap(lum, width, height) : packLuminance(lum, width, height, opts.threshold ?? 128)
}

/** Inverse of packing, for preview: opaque RGBA black/white. */
export function bitmapToRgba(b: MonoBitmap): Uint8ClampedArray {
  const out = new Uint8ClampedArray(b.width * b.height * 4)
  for (let y = 0; y < b.height; y++)
    for (let x = 0; x < b.width; x++) {
      const black = (b.data[y * b.bytesPerRow + (x >> 3)] & (0x80 >> (x & 7))) !== 0
      const o = (y * b.width + x) * 4
      out[o] = out[o + 1] = out[o + 2] = black ? 0 : 255
      out[o + 3] = 255
    }
  return out
}

const FONT = 'ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace'

/**
 * Draw the label on a canvas (a given one, or an OffscreenCanvas / detached <canvas>) and return
 * the 1-bit bitmap. Browser only. QR modules are drawn directly from the `qrcode` matrix.
 */
export async function renderLabelBitmap(
  s: Specimen,
  opts: { canvas?: HTMLCanvasElement; dither?: boolean } = {},
): Promise<MonoBitmap> {
  if (isPendingId(s.specimenId)) throw new Error('No ID yet: refusing to render a label without a specimen ID')
  const W = LABEL_WIDTH_PX, H = LABEL_HEIGHT_PX
  const canvas: any =
    opts.canvas ??
    (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H }))
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#000'
  ctx.textBaseline = 'top'

  const textW = W - QR_BOX_PX - 24
  const font = (px: number, bold = false) => `${bold ? 'bold ' : ''}${px}px ${FONT}`
  ctx.font = font(20)
  const measure = (t: string) => ctx.measureText(t).width
  const model = buildLabelModel(s, { maxWidth: textW, measure })

  // header bar
  ctx.font = font(20, true)
  ctx.fillText(model.id, 6, 4)
  ctx.fillRect(0, 30, W, 2)

  let y = 38
  const line = (t: string, px: number, bold = false) => {
    ctx.font = font(px, bold)
    ctx.fillText(t, 6, y)
    y += px + 4
  }
  for (const l of model.species) line(l, 24, true)
  line(model.when, 18)
  if (model.location) line(model.location, 18)
  for (const l of model.substrate) line(l, 18)
  for (const l of model.notes) line(l, 16)

  // QR (right column, below header)
  const QR = (await import('qrcode')).default ?? (await import('qrcode'))
  const qr = (QR as any).create(model.qr, { errorCorrectionLevel: 'M' })
  const n: number = qr.modules.size
  const mod = Math.max(1, Math.floor(QR_BOX_PX / (n + 2))) // +2: quiet zone
  const side = mod * (n + 2)
  const qx = W - side - 4, qy = H - side - 4
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (qr.modules.get(r, c)) ctx.fillRect(qx + (c + 1) * mod, qy + (r + 1) * mod, mod, mod)

  const img = ctx.getImageData(0, 0, W, H)
  return rgbaToBitmap(img.data, W, H, { dither: opts.dither })
}
