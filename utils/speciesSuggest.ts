// Species-field autocomplete. Works offline: names come from the user's own past finds,
// their voice word list (settings 'voiceVocab') and the built-in mycology list in mycoVocab.
import { SPECIES, levenshtein } from './mycoVocab.ts'

export type SuggestSource = 'past' | 'custom' | 'list'
export interface SpeciesSuggestion {
  name: string
  source: SuggestSource
  /** How many of the user's finds already use this name (past finds only). */
  count?: number
  /** The common name that matched, when the user typed one. */
  common?: string
}

/** Common names people type instead of the Latin name. */
export const COMMON_NAMES: [string, string][] = [
  ['fly agaric', 'Amanita muscaria'], ['death cap', 'Amanita phalloides'], ['destroying angel', 'Amanita bisporigera'],
  ['black trumpet', 'Craterellus cornucopioides'], ['golden chanterelle', 'Cantharellus cibarius'], ['chanterelle', 'Cantharellus cibarius'],
  ['king bolete', 'Boletus edulis'], ['porcini', 'Boletus edulis'], ['penny bun', 'Boletus edulis'], ['false morel', 'Gyromitra esculenta'],
  ['morel', 'Morchella esculenta'], ['chicken of the woods', 'Laetiporus sulphureus'], ['hen of the woods', 'Grifola frondosa'],
  ['maitake', 'Grifola frondosa'], ["lion's mane", 'Hericium erinaceus'], ['turkey tail', 'Trametes versicolor'],
  ['oyster mushroom', 'Pleurotus ostreatus'], ['honey mushroom', 'Armillaria mellea'], ['shaggy mane', 'Coprinus comatus'],
  ['giant puffball', 'Calvatia gigantea'], ['common puffball', 'Lycoperdon perlatum'], ['lobster mushroom', 'Hypomyces lactifluorum'],
  ['hedgehog mushroom', 'Hydnum repandum'], ["jack-o'-lantern", 'Omphalotus illudens'], ["artist's conk", 'Ganoderma applanatum'],
  ['reishi', 'Ganoderma lucidum'], ['shiitake', 'Lentinula edodes'], ['blewit', 'Lepista nuda'], ['parasol', 'Macrolepiota procera'],
  ['sulphur tuft', 'Hypholoma fasciculare'], ['matsutake', 'Tricholoma magnivelare'], ['saffron milk cap', 'Lactarius deliciosus'],
  ['indigo milk cap', 'Lactarius indigo'], ['fairy ring mushroom', 'Marasmius oreades'], ['wood ear', 'Auricularia americana'],
  ['witches butter', 'Tremella mesenterica'], ['scarlet cup', 'Sarcoscypha coccinea'], ['bleeding tooth', 'Hydnellum peckii'],
  ['funeral bell', 'Galerina marginata'], ['velvet foot', 'Flammulina velutipes'], ['enoki', 'Flammulina velutipes'],
  ["dryad's saddle", 'Cerioporus squamosus'], ['pheasant back', 'Cerioporus squamosus'], ['old man of the woods', 'Strobilomyces strobilaceus'],
  ['cauliflower mushroom', 'Sparassis crispa'], ['wine cap', 'Stropharia rugosoannulata'], ['deer mushroom', 'Pluteus cervinus'],
  ["dead man's fingers", 'Xylaria polymorpha'], ['tinder conk', 'Fomes fomentarius'], ['birch polypore', 'Fomitopsis betulina'],
  ['red-belted conk', 'Fomitopsis pinicola'], ['bird’s nest fungus', 'Cyathus striatus'], ['stinkhorn', 'Phallus impudicus'],
  ['yellow foot', 'Craterellus tubaeformis'], ['slippery jack', 'Suillus luteus'], ['the sickener', 'Russula emetica'],
]

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim()
/** Same key the dex uses: case, spacing and a trailing "?" don't make a new name. */
const key = (s: string) => norm(s).replace(/\?+$/, '').trim()

/** The user's past names, most used first (ties: most recent first). */
export function rankPastNames(guesses: { name?: string; at?: number }[]): { name: string; count: number }[] {
  const by = new Map<string, { name: string; count: number; at: number }>()
  for (const g of guesses) {
    const raw = (g.name ?? '').replace(/\s+/g, ' ').trim().replace(/\?+$/, '').trim()
    if (!raw || raw.length > 80) continue
    const k = key(raw)
    const at = g.at ?? 0
    const e = by.get(k)
    if (!e) by.set(k, { name: raw, count: 1, at })
    else {
      e.count++
      if (at >= e.at) { e.at = at; e.name = raw }
    }
  }
  return [...by.values()].sort((a, b) => b.count - a.count || b.at - a.at).map(({ name, count }) => ({ name, count }))
}

/**
 * How well `name` matches the typed text; lower is better, null for no match.
 * 0 whole-name prefix, 1 a later word starts with it ("musc" → Amanita muscaria),
 * 2 abbreviated genus ("A. musc", "a mus"), 3 contains it, 4 close misspelling.
 */
function score(name: string, q: string): number | null {
  const n = norm(name)
  if (n.startsWith(q)) return 0
  const words = n.split(' ')
  if (!q.includes(' ') && words.slice(1).some((w) => w.startsWith(q))) return 1
  const m = q.match(/^([a-z])\.?\s+(\S+)/)
  if (m && words.length > 1 && words[0][0] === m[1] && words[1].startsWith(m[2])) return 2
  if (q.length >= 3 && n.includes(q)) return 3
  if (q.length >= 4) {
    // Compare against the same-length start of the name (and of the epithet), so a typo in a
    // half-typed name still matches.
    const max = q.length >= 7 ? 2 : 1
    const starts = [n, ...(words.length > 1 ? [words.slice(1).join(' ')] : [])]
    if (starts.some((s) => levenshtein(s.slice(0, q.length), q, max) <= max)) return 4
  }
  return null
}

export interface SuggestOptions {
  /** Ranked names from the user's past finds (see rankPastNames). */
  past?: { name: string; count: number }[]
  /** The user's own word list. */
  custom?: string[]
  /** Built-in list; defaults to mycoVocab SPECIES. */
  list?: string[]
  limit?: number
}

export function suggestSpecies(query: string, opts: SuggestOptions = {}): SpeciesSuggestion[] {
  const q = norm(query).replace(/\?+$/, '').trim()
  if (!q) return []
  const limit = opts.limit ?? 6
  const pool: (SpeciesSuggestion & { order: number })[] = []
  let order = 0
  for (const p of opts.past ?? []) pool.push({ name: p.name, source: 'past', count: p.count, order: order++ })
  for (const c of opts.custom ?? []) pool.push({ name: c, source: 'custom', order: order++ })
  for (const s of opts.list ?? SPECIES) pool.push({ name: s, source: 'list', order: order++ })

  const seen = new Set<string>()
  const hits: { s: SpeciesSuggestion; rank: number; order: number }[] = []
  const add = (s: SpeciesSuggestion, rank: number, ord: number) => {
    const k = key(s.name)
    if (seen.has(k)) return
    seen.add(k)
    hits.push({ s, rank, order: ord })
  }
  // Pool order is past → custom → list, so a name the user already used keeps its count.
  for (const p of pool) {
    const sc = score(p.name, q)
    if (sc == null) continue
    // Past finds and the user's list rank above the built-in list at the same match quality.
    const { order: ord, ...s } = p
    add(s, sc * 3 + (p.source === 'list' ? 2 : p.source === 'custom' ? 1 : 0), ord)
  }
  if (q.length >= 3) {
    for (const [common, latin] of COMMON_NAMES) {
      const c = norm(common)
      if (!(c.startsWith(q) || c.split(' ').some((w) => w.startsWith(q)))) continue
      const past = opts.past?.find((p) => key(p.name) === key(latin))
      add({ name: latin, source: past ? 'past' : 'list', count: past?.count, common }, (c.startsWith(q) ? 1 : 3) * 3 + (past ? 0 : 2), order++)
    }
  }
  hits.sort((a, b) => a.rank - b.rank || a.order - b.order)
  // Misspelling matches are only a fallback; next to real matches they are noise.
  const close = hits.filter((h) => h.rank < 12)
  if (close.length) hits.splice(0, hits.length, ...close)
  // Nothing to offer when the only hit is exactly what is already typed.
  if (hits.length === 1 && key(hits[0].s.name) === q) return []
  return hits.slice(0, limit).map((h) => h.s)
}
