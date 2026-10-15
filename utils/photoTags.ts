// Photo tag suggestions: the prompt we give the on-device vision model and how we read its answer.
// The model only suggests; the user accepts or rejects each value (components/PhotoTagSuggest.vue).
// DOM-free so tests/phototags.test.mjs can run it under node --experimental-strip-types.
import type { FieldNotes } from './db.ts'
import { FIELD_DEFS, type FieldDef, type FieldKey } from './fieldForm.ts'

/** Fields a photo can show. Size, smell, staining, spore print and the species need more than a picture. */
export const PHOTO_FIELDS: FieldKey[] = [
  'habitat', 'substrate', 'growth',
  'capShape', 'capColor', 'capTexture',
  'underside', 'gillAttachment', 'gillColor',
  'stemColor', 'stemFeatures',
]

export interface TagSuggestion { key: FieldKey; label: string; value: string }

const defOf = (k: FieldKey) => FIELD_DEFS.find((f) => f.key === k) as FieldDef

/** Fields worth asking about: shown on the form and still empty. */
export function askableFields(notes: FieldNotes, visible?: Set<string>): FieldKey[] {
  return PHOTO_FIELDS.filter((k) => (!visible || visible.has(k)) && !String(notes[k] ?? '').trim())
}

/** The text part of the prompt; the photos go before it. */
export function buildTagPrompt(keys: FieldKey[]): string {
  const lines = keys.map((k) => {
    const d = defOf(k)
    return d.options ? `- ${k} (${d.label}): one of ${d.options.join(', ')}` : `- ${k} (${d.label}): a few words`
  })
  return [
    'These photos show one wild mushroom find.',
    'Fill in only the fields you can clearly see in the photos. Leave out anything you cannot see or are unsure of.',
    'Do not guess the species.',
    'Fields:',
    ...lines,
    'Answer with one JSON object and nothing else, for example {"capShape": "convex", "capColor": "orange-brown"}.',
  ].join('\n')
}

/** Pull the first {...} object out of the model's answer (it may wrap it in ``` fences or add words). */
function firstJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inStr = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inStr) {
      if (c === '\\') i++
      else if (c === '"') inStr = false
    } else if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) {
      try {
        const v = JSON.parse(text.slice(start, i + 1))
        return v && typeof v === 'object' && !Array.isArray(v) ? v : null
      } catch { return null }
    }
  }
  return null
}

const UNSURE = /^(unknown|unsure|unclear|not visible|n\/a|na|none visible|cannot see|can't see|-)$/i

/** Match a free answer to the field's own wording when it is one of the quick picks. */
function toOption(d: FieldDef, value: string): string {
  if (!d.options) return value
  const opts = d.options
  return value.split(/\s*,\s*/).map((part) => {
    const v = part.toLowerCase()
    return opts.find((o) => o.toLowerCase() === v)
      ?? opts.find((o) => v.includes(o.toLowerCase()) || o.toLowerCase().includes(v))
      ?? part
  }).join(', ')
}

/** Turn the model's answer into suggestions for the asked fields only. */
export function parseTagAnswer(text: string, keys: FieldKey[]): TagSuggestion[] {
  const obj = firstJsonObject(text)
  if (!obj) return []
  const out: TagSuggestion[] = []
  for (const k of keys) {
    let raw = obj[k]
    if (Array.isArray(raw)) raw = raw.filter((x) => typeof x === 'string').join(', ')
    if (typeof raw !== 'string') continue
    const v = raw.trim().replace(/\.$/, '').slice(0, 60)
    if (!v || UNSURE.test(v)) continue
    const d = defOf(k)
    out.push({ key: k, label: d.label, value: toOption(d, v) })
  }
  return out
}
