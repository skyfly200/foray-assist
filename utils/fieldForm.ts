// The specimen field form: which fields exist, how they are grouped, and the printed ruler.
// Shared by AttributeForm (editing), voiceExtract (filling from speech) and FieldFormSheet (printing).
// DOM-free so tests/fieldform.test.mjs can run it under node --experimental-strip-types.
import type { FieldNotes } from './db.ts'

export type FieldKey = Exclude<keyof FieldNotes, 'notes'>

export interface FieldDef {
  key: FieldKey
  label: string
  /** Quick-pick chips. The value is still free text. */
  options?: string[]
  placeholder?: string
}

export const FIELD_DEFS: FieldDef[] = [
  { key: 'speciesGuess', label: 'Species guess' },
  { key: 'habitat', label: 'Habitat', options: ['mixed woods', 'conifer forest', 'hardwood forest', 'lawn/grass', 'meadow', 'wetland', 'trailside', 'urban/park'] },
  { key: 'substrate', label: 'Substrate', options: ['decaying conifer', 'soil', 'hardwood log', 'leaf litter', 'moss', 'living tree', 'dung/wood chips'] },
  { key: 'hostTree', label: 'Host tree', options: ['oak', 'pine', 'spruce', 'fir', 'birch', 'beech', 'maple', 'aspen', 'hemlock'] },
  { key: 'growth', label: 'Growth', options: ['solitary', 'scattered', 'in groups', 'clustered', 'fairy ring', 'shelving'] },
  { key: 'capShape', label: 'Cap shape', options: ['convex', 'flat', 'conical', 'bell-shaped', 'umbonate', 'depressed', 'funnel-shaped'] },
  { key: 'capColor', label: 'Cap color' },
  { key: 'capSize', label: 'Cap size', placeholder: 'e.g. 5 cm across' },
  { key: 'capTexture', label: 'Cap texture', options: ['smooth', 'slimy', 'sticky', 'scaly', 'fibrous', 'velvety', 'wrinkled'] },
  { key: 'underside', label: 'Underside', options: ['gills', 'pores', 'teeth', 'ridges', 'smooth'] },
  { key: 'gillAttachment', label: 'Gill attachment', options: ['free', 'adnate', 'adnexed', 'decurrent', 'notched'] },
  { key: 'gillColor', label: 'Gill or pore color' },
  { key: 'stemSize', label: 'Stem size', placeholder: 'e.g. 8 cm long, 1 cm thick' },
  { key: 'stemColor', label: 'Stem color' },
  { key: 'stemFeatures', label: 'Stem features', options: ['ring', 'volva', 'bulbous base', 'hollow', 'reticulate', 'scabers'] },
  { key: 'odor', label: 'Odor', options: ['none', 'mild', 'farinaceous', 'anise', 'garlic', 'fishy', 'fruity', 'sweet', 'foul'] },
  { key: 'staining', label: 'Staining', options: ['none', 'bruises blue', 'bruises red', 'bruises yellow', 'bruises brown'] },
  { key: 'sporePrint', label: 'Spore print', options: ['white', 'cream', 'pink', 'brown', 'purple-brown', 'black'] },
]

export const FIELD_LABELS = Object.fromEntries(FIELD_DEFS.map((f) => [f.key, f.label])) as Record<FieldKey, string>

export interface FieldGroup { id: string; title: string; emoji: string; icon: string; keys: FieldKey[] }

export const FIELD_GROUPS: FieldGroup[] = [
  { id: 'id', title: 'What is it?', emoji: '🍄', icon: 'mdi-magnify', keys: ['speciesGuess'] },
  { id: 'habitat', title: 'Where it grows', emoji: '🌲', icon: 'mdi-tree', keys: ['habitat', 'substrate', 'hostTree', 'growth'] },
  { id: 'cap', title: 'Cap', emoji: '🎩', icon: 'mdi-umbrella-outline', keys: ['capShape', 'capColor', 'capSize', 'capTexture'] },
  { id: 'under', title: 'Gills or pores', emoji: '〰️', icon: 'mdi-view-week-outline', keys: ['underside', 'gillAttachment', 'gillColor'] },
  { id: 'stem', title: 'Stem', emoji: '🦯', icon: 'mdi-format-vertical-align-center', keys: ['stemSize', 'stemColor', 'stemFeatures'] },
  { id: 'tests', title: 'Smell, staining, spores', emoji: '👃', icon: 'mdi-flask-outline', keys: ['odor', 'staining', 'sporePrint'] },
]

export const groupOf = (key: FieldKey) => FIELD_GROUPS.find((g) => g.keys.includes(key))?.id

// ---------- printed ruler ----------

export interface RulerTick { at: number; len: 'short' | 'mid' | 'long'; label?: string }

/** Tick marks for a ruler `length` units long with `sub` subdivisions per labelled unit. */
export function rulerTicks(length: number, sub: number): RulerTick[] {
  const out: RulerTick[] = []
  const n = Math.round(length * sub)
  for (let i = 0; i <= n; i++) {
    const whole = i % sub === 0
    const half = !whole && sub % 2 === 0 && i % (sub / 2) === 0
    out.push({ at: i / sub, len: whole ? 'long' : half ? 'mid' : 'short', ...(whole ? { label: String(i / sub) } : {}) })
  }
  return out
}

/**
 * True-size ruler as an SVG string: centimetres with millimetre ticks on top, inches with
 * 1/8" ticks below. Sized in mm, so it prints at real size when the page is printed at 100%.
 */
export function rulerSvg(lengthMm = 150): string {
  const pad = 3
  const W = lengthMm + pad * 2 + 4 // room for the unit names past the end
  const H = 22
  const mid = 11
  const parts: string[] = []
  const line = (x: number, y1: number, y2: number, w: number) =>
    parts.push(`<line x1="${x.toFixed(3)}" y1="${y1}" x2="${x.toFixed(3)}" y2="${y2}" stroke="#000" stroke-width="${w}"/>`)
  const text = (x: number, y: number, t: string, anchor = 'middle') =>
    parts.push(`<text x="${x.toFixed(3)}" y="${y}" font-size="2.6" font-family="sans-serif" text-anchor="${anchor}">${t}</text>`)

  for (const t of rulerTicks(lengthMm / 10, 10)) {
    const x = pad + t.at * 10
    line(x, mid, mid - (t.len === 'long' ? 5 : t.len === 'mid' ? 3.5 : 2), t.len === 'long' ? 0.3 : 0.15)
    if (t.label) text(x, mid - 6, t.label)
  }
  text(pad + lengthMm + 1.5, mid - 6, 'cm', 'start')
  const inches = Math.floor(lengthMm / 25.4 * 8) / 8
  for (const t of rulerTicks(inches, 8)) {
    const x = pad + t.at * 25.4
    line(x, mid, mid + (t.len === 'long' ? 5 : t.len === 'mid' ? 3.5 : 2), t.len === 'long' ? 0.3 : 0.15)
    if (t.label) text(x, mid + 8.5, t.label)
  }
  text(pad + lengthMm + 1.5, mid + 8.5, 'in', 'start')
  parts.push(`<line x1="${pad}" y1="${mid}" x2="${pad + lengthMm}" y2="${mid}" stroke="#000" stroke-width="0.3"/>`)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ruler, ${lengthMm / 10} cm">${parts.join('')}</svg>`
}

/** Dots per millimetre of the 203 dpi label printer. */
export const LABEL_DOTS_PER_MM = 203 / 25.4
