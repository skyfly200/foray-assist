// Turn a spoken field note into field-form values, on the device, with no network.
// "Brown convex cap about 6 cm across, white gills, smells like anise, under oaks"
//   -> { capColor: 'brown', capShape: 'convex', capSize: '6 cm across', gillColor: 'white', odor: 'anise', hostTree: 'oak' }
// Rule based on purpose: it runs on every live transcript update while offline in the woods,
// and it is predictable (a word list, not a model). Colours, sizes and textures go to the
// nearest part named in the same sentence (cap, gills, stem, spore print).
// DOM-free so tests/voiceextract.test.mjs can run it under node --experimental-strip-types.
import type { FieldNotes } from './db.ts'
import { SPECIES } from './mycoVocab.ts'
import type { FieldKey } from './fieldForm.ts'

export type Extracted = Partial<Record<FieldKey, string>>

type Part = 'cap' | 'gills' | 'stem' | 'spore' | 'flesh'

const PARTS: Record<string, Part> = {
  cap: 'cap', caps: 'cap', pileus: 'cap', mushroom: 'cap', mushrooms: 'cap',
  gill: 'gills', gills: 'gills', lamellae: 'gills', pores: 'gills', pore: 'gills', tubes: 'gills', teeth: 'gills', spines: 'gills', underside: 'gills',
  stem: 'stem', stems: 'stem', stipe: 'stem', stipes: 'stem', stalk: 'stem', stalks: 'stem',
  spore: 'spore', spores: 'spore',
  flesh: 'flesh', context: 'flesh', latex: 'flesh', milk: 'flesh',
}

const COLORS = new Set([
  'white', 'cream', 'ivory', 'buff', 'tan', 'beige', 'brown', 'chestnut', 'cinnamon', 'rust', 'ochre', 'yellow', 'golden',
  'gold', 'orange', 'red', 'scarlet', 'crimson', 'pink', 'salmon', 'purple', 'violet', 'lilac', 'lavender', 'blue', 'green',
  'olive', 'gray', 'grey', 'black', 'silver', 'maroon', 'apricot', 'whitish', 'brownish', 'yellowish', 'reddish', 'orangish',
  'orangey', 'pinkish', 'purplish', 'bluish', 'greenish', 'grayish', 'greyish', 'blackish', 'tawny', 'smoky', 'colorless',
])
const COLOR_MODS = new Set(['pale', 'light', 'dark', 'deep', 'bright', 'dull', 'dusky', 'vivid'])

const NEG = new Set(['no', 'not', 'without', "doesn't", 'doesnt', "isn't", 'isnt', "don't", 'dont', 'never', 'lacks', 'lacking', "didn't", "aren't", 'non'])

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, half: 0.5, quarter: 0.25,
}

const TEXTURES: Record<string, string> = {
  smooth: 'smooth', slimy: 'slimy', slippery: 'slimy', glutinous: 'slimy', sticky: 'sticky', tacky: 'sticky', viscid: 'sticky',
  scaly: 'scaly', scales: 'scaly', squamules: 'scaly', squamulose: 'scaly', fibrous: 'fibrous', fibrillose: 'fibrous',
  velvety: 'velvety', velvet: 'velvety', fuzzy: 'velvety', hairy: 'velvety', tomentose: 'velvety', wrinkled: 'wrinkled',
  wrinkly: 'wrinkled', rugose: 'wrinkled', warts: 'warty', warty: 'warty', powdery: 'powdery', shiny: 'shiny', dry: 'dry',
}

// "<word> shaped" / "shaped like a <word>": canonical names for words people use. Anything else
// said that way is kept as "<word>-shaped".
const SHAPE_NOUNS: Record<string, string> = { cone: 'conical', bell: 'bell-shaped', ball: 'round', globe: 'round', button: 'button-shaped', dome: 'convex' }
const NOT_SHAPES = new Set(['is', 'was', 'a', 'an', 'the', 'its', "it's", 'odd', 'oddly', 'weird', 'weirdly', 'strange', 'strangely', 'nicely', 'well', 'same', 'of', 'in', 'and', 'kind', 'sort', 'cap', 'stem', 'mushroom', ','])

const SHAPES: Record<string, string> = {
  convex: 'convex', flat: 'flat', plane: 'flat', conical: 'conical', conic: 'conical', cone: 'conical', bell: 'bell-shaped',
  campanulate: 'bell-shaped', umbonate: 'umbonate', umbo: 'umbonate', depressed: 'depressed', funnel: 'funnel-shaped',
  infundibuliform: 'funnel-shaped', vase: 'vase-shaped', domed: 'convex', dome: 'convex', rounded: 'convex', wavy: 'wavy',
  cordate: 'heart-shaped', reniform: 'kidney-shaped', flabelliform: 'fan-shaped', hemispherical: 'hemispherical',
  ovoid: 'egg-shaped', spherical: 'round', globose: 'round', parabolic: 'parabolic', irregular: 'irregular',
}

const TREES: Record<string, string> = {
  oak: 'oak', oaks: 'oak', pine: 'pine', pines: 'pine', spruce: 'spruce', spruces: 'spruce', fir: 'fir', firs: 'fir',
  birch: 'birch', birches: 'birch', beech: 'beech', beeches: 'beech', maple: 'maple', maples: 'maple', aspen: 'aspen',
  aspens: 'aspen', hemlock: 'hemlock', hemlocks: 'hemlock', cedar: 'cedar', cedars: 'cedar', poplar: 'poplar', poplars: 'poplar',
  cottonwood: 'cottonwood', larch: 'larch', tamarack: 'larch', alder: 'alder', alders: 'alder', willow: 'willow', willows: 'willow',
  elm: 'elm', elms: 'elm', hickory: 'hickory', eucalyptus: 'eucalyptus', redwood: 'redwood', madrone: 'madrone', tanoak: 'tanoak',
  chestnut: 'chestnut', walnut: 'walnut', cherry: 'cherry', douglas: 'Douglas fir', 'douglas-fir': 'Douglas fir',
}
const CONIFERS = new Set(['pine', 'spruce', 'fir', 'hemlock', 'cedar', 'larch', 'Douglas fir', 'redwood', 'conifer'])

const ODORS: Record<string, string> = {
  farinaceous: 'farinaceous', mealy: 'farinaceous', flour: 'farinaceous', floury: 'farinaceous', cucumber: 'farinaceous',
  watermelon: 'farinaceous', anise: 'anise', aniseed: 'anise', licorice: 'anise', liquorice: 'anise', garlic: 'garlic',
  garlicky: 'garlic', fish: 'fishy', fishy: 'fishy', fruity: 'fruity', apricot: 'fruity', apricots: 'fruity', fruit: 'fruity',
  sweet: 'sweet', foul: 'foul', rotten: 'foul', rotting: 'foul', stinky: 'foul', mild: 'mild', faint: 'mild', radish: 'radish',
  earthy: 'earthy', almond: 'almond', almonds: 'almond', bleach: 'bleach', chlorine: 'bleach', spicy: 'spicy', peppery: 'spicy',
  mushroomy: 'mild', pleasant: 'pleasant', unpleasant: 'unpleasant',
}
const ODOR_CUES = new Set(['smell', 'smells', 'smelled', 'smelling', 'odor', 'odour', 'odors', 'scent', 'scented', 'aroma', 'fragrance', 'fragrant', 'smelly'])
// Odor words specific enough to count without "smells".
const ODOR_STRONG = new Set(['farinaceous', 'anise', 'aniseed', 'licorice', 'liquorice'])

// Words that make a colour a surface feature: "white warts" is cap texture, not cap colour.
const FEATURE_NOUNS: Record<string, string> = {
  warts: 'warts', wart: 'warts', scales: 'scales', patches: 'patches', spots: 'spots', flecks: 'flecks', fibers: 'fibers',
  fibres: 'fibers', fibrils: 'fibers', squamules: 'scales', dots: 'dots', streaks: 'streaks', zones: 'zones', bands: 'bands',
}

// Common names said instead of a Latin name. Used only when no Latin name was heard.
const COMMON_NAMES: [RegExp, string][] = [
  [/\bfly agaric\b/, 'Amanita muscaria'], [/\bdeath ?caps?\b/, 'Amanita phalloides'], [/\bdestroying angels?\b/, 'Amanita bisporigera'],
  [/\bblack trumpets?\b/, 'Craterellus cornucopioides'], [/\bchanterelles?\b/, 'Cantharellus'], [/\b(king bolete|porcini|penny bun)\b/, 'Boletus edulis'],
  [/\bfalse morels?\b/, 'Gyromitra'], [/\bmorels?\b/, 'Morchella'], [/\bchicken of the woods\b/, 'Laetiporus'], [/\bhen of the woods\b|\bmaitake\b/, 'Grifola frondosa'],
  [/\blion'?s mane\b/, 'Hericium erinaceus'], [/\bturkey tails?\b/, 'Trametes versicolor'], [/\boyster mushrooms?\b|\boysters\b/, 'Pleurotus'],
  [/\bhoney mushrooms?\b/, 'Armillaria'], [/\bshaggy manes?\b/, 'Coprinus comatus'], [/\bgiant puffball\b/, 'Calvatia gigantea'],
  [/\bpuffballs?\b/, 'Lycoperdon'], [/\blobster mushrooms?\b/, 'Hypomyces lactifluorum'], [/\bhedgehog mushrooms?\b/, 'Hydnum'],
  [/\bjack o'? ?lanterns?\b/, 'Omphalotus'], [/\bartist'?s conk\b/, 'Ganoderma applanatum'], [/\breishi\b/, 'Ganoderma'],
  [/\bshiitake\b/, 'Lentinula edodes'], [/\bblewits?\b/, 'Lepista nuda'], [/\bparasol mushrooms?\b/, 'Macrolepiota procera'],
  [/\bsulphur tuft\b/, 'Hypholoma fasciculare'], [/\bmatsutake\b/, 'Tricholoma magnivelare'], [/\bmilk ?caps?\b/, 'Lactarius'],
]

const STAIN_CUES = /^(bruis|stain|discolou?r)/
const CHANGE_CUES = new Set(['turns', 'turned', 'turning', 'changes', 'changed', 'changing', 'goes', 'went'])
const DAMAGE = /\b(cut|cuts|bruised|handled|touched|pressed|damaged|broken|injured|scratched|squeezed|sliced|exposed)\b/

type Tok = string

function normalize(text: string): string {
  let s = ` ${text.toLowerCase()} `
  s = s.replace(/[’']/g, "'").replace(/[“”"]/g, ' ')
  s = s.replace(/(\d),(\d{3})/g, '$1$2')
  // number words -> digits, including "two and a half" / "two point five"
  s = s.replace(/\b(\w+) and a half\b/g, (m, w) => (w in NUMBER_WORDS ? String(NUMBER_WORDS[w] + 0.5) : /^\d+$/.test(w) ? `${w}.5` : m))
  s = s.replace(/\b(\w+) point (\w+)\b/g, (m, a, b) => {
    const x = a in NUMBER_WORDS ? NUMBER_WORDS[a] : /^\d+$/.test(a) ? +a : NaN
    const y = b in NUMBER_WORDS ? NUMBER_WORDS[b] : /^\d$/.test(b) ? +b : NaN
    return Number.isFinite(x) && Number.isFinite(y) && y < 10 ? `${x}.${y}` : m
  })
  s = s.replace(/\b(a )?half (an? )?(?=(centimet|millimet|inch))/g, '0.5 ')
  s = s.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty)\b/g, (w) => String(NUMBER_WORDS[w]))
  // units
  s = s.replace(/(\d)\s*-?\s*(centimet(?:er|re)s?|cms?)\b/g, '$1 cm')
  s = s.replace(/(\d)\s*-?\s*(millimet(?:er|re)s?|mm)\b/g, '$1 mm')
  s = s.replace(/(\d)\s*-?\s*(inch(?:es)?)\b/g, '$1 inch')
  s = s.replace(/(\d)\s*(?:-|to|through)\s*(\d)/g, '$1 to $2')
  // compound words
  s = s.replace(/\bspore[- ]prints?\b/g, 'spore print')
  s = s.replace(/\bfalse gills\b/g, 'falsegills')
  s = s.replace(/\bfairy rings?\b/g, 'fairyring')
  s = s.replace(/\bwood ?chips\b/g, 'woodchips')
  s = s.replace(/\bleaf litter\b|\bneedle litter\b|\bduff\b/g, 'leaflitter')
  s = s.replace(/\bdoes not\b/g, "doesn't").replace(/\bis not\b/g, "isn't").replace(/\bdo not\b/g, "don't")
  s = s.replace(/-/g, ' ')
  return s
}

function sentences(norm: string): Tok[][] {
  return norm
    .split(/[.!?;]+(?=\s|$)|\bbut\b|\bhowever\b|\bactually\b/)
    .map((sen) => sen.replace(/,/g, ' , ').replace(/[^\w\s,.']/g, ' ').split(/\s+/).filter(Boolean))
    .filter((t) => t.length)
}

const isNum = (t: string | undefined) => !!t && /^\d+(\.\d+)?$/.test(t)
const negated = (toks: Tok[], i: number) => NEG.has(toks[i - 1]) || NEG.has(toks[i - 2]) || (toks[i - 1] === 'a' && NEG.has(toks[i - 2]))

/** Colour phrase starting at i: [modifiers] colour [to|and colour]. Returns end index (exclusive) or -1. */
function colorAt(toks: Tok[], i: number): { end: number; text: string } | null {
  let j = i
  const words: string[] = []
  while (COLOR_MODS.has(toks[j]) || COLORS.has(toks[j])) words.push(toks[j++])
  if (!words.length || !COLORS.has(words[words.length - 1])) return null
  // "white to cream", "brown and white"
  if ((toks[j] === 'to' || toks[j] === 'and' || toks[j] === 'or') && (COLORS.has(toks[j + 1]) || (COLOR_MODS.has(toks[j + 1]) && COLORS.has(toks[j + 2])))) {
    const more = colorAt(toks, j + 1)
    if (more) return { end: more.end, text: `${words.join(' ')} ${toks[j] === 'or' ? 'to' : toks[j]} ${more.text}` }
  }
  return { end: j, text: words.join(' ') }
}

function nearestPart(parts: { i: number; part: Part }[], i: number, end: number, max = 6): Part | null {
  let best: { d: number; part: Part } | null = null
  for (const p of parts) {
    const d = p.i < i ? i - p.i : p.i - (end - 1)
    // Prefer the noun that follows ("white gills") over one before on ties ("cap brown, gills white").
    const score = d + (p.i < i ? 0.1 : 0)
    if (d <= max && (!best || score < best.d)) best = { d: score, part: p.part }
  }
  return best?.part ?? null
}

function canonicalGenusIndex(extra: string[]) {
  const species = new Map<string, string>()
  const genera = new Map<string, string>()
  for (const raw of [...extra, ...SPECIES]) {
    const parts = raw.trim().split(/\s+/)
    if (!parts[0] || parts[0].length < 4) continue
    const genus = parts[0][0].toUpperCase() + parts[0].slice(1).toLowerCase()
    if (!genera.has(genus.toLowerCase())) genera.set(genus.toLowerCase(), genus)
    if (parts.length >= 2) {
      const key = parts.join(' ').toLowerCase()
      if (!species.has(key)) species.set(key, [genus, ...parts.slice(1)].join(' '))
    }
  }
  return { species, genera }
}

/**
 * Pull field-form values out of a transcript. Run it on the corrected transcript
 * (correctTranscript) so Latin names are already spelled right. `names` adds species to look for.
 */
export function extractFieldNotes(text: string, names: string[] = []): Extracted {
  const out: Extracted = {}
  if (!text?.trim()) return out
  const multi: Partial<Record<FieldKey, string[]>> = {}
  const add = (k: FieldKey, v: string) => {
    const list = (multi[k] ??= [])
    if (!list.includes(v)) list.push(v)
  }
  const set = (k: FieldKey, v: string) => { out[k] = v } // later mentions win ("actually it has pores")

  // Species: an exact binomial from the known list, else a known genus on its own.
  const { species, genera } = canonicalGenusIndex(names)
  const plain = ` ${text.toLowerCase().replace(/[^a-z'\s-]/g, ' ').replace(/\s+/g, ' ')} `
  let bestSpecies: { at: number; name: string } | null = null
  for (const [key, name] of species) {
    const at = plain.lastIndexOf(` ${key} `)
    if (at >= 0 && (!bestSpecies || at > bestSpecies.at)) bestSpecies = { at, name }
  }
  if (bestSpecies) set('speciesGuess', bestSpecies.name)
  else {
    let bestGenus: { at: number; name: string } | null = null
    for (const [key, name] of genera) {
      // Lower-case genus words that are also English ("amanita" is fine, but avoid e.g. "agaricus" false hits by needing 5+ letters).
      const at = plain.lastIndexOf(` ${key} `)
      if (key.length >= 5 && at >= 0 && (!bestGenus || at > bestGenus.at)) bestGenus = { at, name }
    }
    if (bestGenus) set('speciesGuess', bestGenus.name)
    else {
      // The last name said wins; on the same end ("false morel" vs "morel") the longer one.
      let bestCommon: { end: number; len: number; name: string } | null = null
      for (const [re, name] of COMMON_NAMES) {
        const m = [...plain.matchAll(new RegExp(re.source, 'g'))].pop()
        if (!m) continue
        const end = m.index! + m[0].length
        if (!bestCommon || end > bestCommon.end || (end === bestCommon.end && m[0].length > bestCommon.len)) bestCommon = { end, len: m[0].length, name }
      }
      if (bestCommon) set('speciesGuess', bestCommon.name)
    }
  }

  for (const toks of sentences(normalize(text))) {
    const used = new Set<number>()
    const parts: { i: number; part: Part }[] = []
    toks.forEach((t, i) => {
      if (t === 'print' && toks[i - 1] === 'spore') return
      const p = PARTS[t]
      // "mushroom" only stands in for the cap when no real cap word is in the sentence.
      if (p) parts.push({ i, part: p })
    })
    const hasRealCap = toks.some((t) => t === 'cap' || t === 'caps' || t === 'pileus')
    const partList = hasRealCap ? parts.filter((p) => toks[p.i] !== 'mushroom' && toks[p.i] !== 'mushrooms') : parts
    const sentence = toks.join(' ')

    // --- staining: "bruises blue", "stains yellow when cut", "turns blue when handled", "no staining"
    toks.forEach((t, i) => {
      const strong = STAIN_CUES.test(t)
      const change = CHANGE_CUES.has(t) && DAMAGE.test(sentence)
      if (!strong && !change) return
      if (strong && negated(toks, i)) { set('staining', 'none'); used.add(i); return }
      for (let j = i + 1; j <= i + 5 && j < toks.length; j++) {
        if (toks[j] === ',') break
        const c = colorAt(toks, j)
        if (c) {
          set('staining', `${t.startsWith('stain') ? 'stains' : 'bruises'} ${c.text}`)
          for (let k = j; k < c.end; k++) used.add(k)
          used.add(i)
          return
        }
      }
      // "blue bruising"
      if (strong) {
        for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
          if (COLORS.has(toks[j])) {
            let s = j
            while (s > 0 && (COLOR_MODS.has(toks[s - 1]) || COLORS.has(toks[s - 1]))) s--
            set('staining', `bruises ${toks.slice(s, j + 1).join(' ')}`)
            for (let k = s; k <= j; k++) used.add(k)
            return
          }
        }
      }
    })

    // --- odor
    toks.forEach((t, i) => {
      const cue = ODOR_CUES.has(t)
      if (cue) {
        if (negated(toks, i) || toks[i + 1] === 'nothing' || (toks[i + 1] === 'like' && toks[i + 2] === 'nothing')) { set('odor', 'none'); return }
        for (let j = i + 1; j <= i + 5 && j < toks.length; j++) {
          if (toks[j] === ',') break
          const o = ODORS[toks[j]]
          if (o) { set('odor', o); used.add(j); return }
        }
        // "smells like bubblegum": keep the word(s) they said
        if (toks[i + 1] === 'like' || toks[i + 1] === 'of') {
          const words = toks.slice(i + 2, i + 5).filter((w) => w !== ',' && !['a', 'an', 'the', 'some'].includes(w))
          const stop = words.findIndex((w) => ['and', 'with', 'under', 'on', 'in', 'near'].includes(w))
          const phrase = (stop >= 0 ? words.slice(0, stop) : words.slice(0, 2)).join(' ')
          if (phrase) set('odor', phrase)
        }
      } else if (ODOR_STRONG.has(t)) set('odor', ODORS[t])
      else if (/^(odou?rless|scentless)$/.test(t)) set('odor', 'none')
    })

    // --- sizes: "6 cm across", "3 to 5 cm", "stem 8 cm long and 1 cm thick"
    for (let i = 0; i < toks.length; i++) {
      if (!isNum(toks[i])) continue
      let j = i + 1
      let num = toks[i]
      if (toks[j] === 'to' && isNum(toks[j + 1])) { num = `${toks[i]}-${toks[j + 1]}`; j += 2 }
      const unit = toks[j]
      if (unit !== 'cm' && unit !== 'mm' && unit !== 'inch') continue
      let end = j + 1
      while (['wide', 'across', 'long', 'tall', 'high', 'thick', 'diameter', 'in'].includes(toks[end]) && end < j + 3) end++
      const dim = toks.slice(j + 1, end).filter((w) => w !== 'in').join(' ')
      const unitText = unit === 'inch' ? (num === '1' ? 'inch' : 'inches') : unit
      const value = `${num} ${unitText}${dim ? ` ${dim}` : ''}`
      let part = nearestPart(partList.filter((p) => p.part === 'cap' || p.part === 'stem'), i, end, 8)
      if (!part) part = /across|wide|diameter/.test(dim) ? 'cap' : /long|tall|high|thick/.test(dim) ? 'stem' : null
      if (part === 'cap') add('capSize', value)
      else if (part === 'stem') add('stemSize', value)
      for (let k = i; k < end; k++) used.add(k)
      i = end - 1
    }

    // --- spore print colour (any colour right after or before "spore print")
    toks.forEach((t, i) => {
      if (t !== 'spore' && t !== 'spores') return
      for (const j of [i + 2, i + 3, i + 4, i + 1]) {
        const c = !used.has(j) && colorAt(toks, j)
        if (c && toks.slice(i + 1, j).every((w) => ['print', 'is', 'was', 'looks', 'are', 'a', 'it', 's', "it's", 'pretty', 'very'].includes(w))) {
          set('sporePrint', c.text)
          for (let k = j; k < c.end; k++) used.add(k)
          return
        }
      }
    })

    // --- colours to the nearest part
    for (let i = 0; i < toks.length; i++) {
      if (used.has(i)) continue
      const c = colorAt(toks, i)
      if (!c) continue
      const feature = FEATURE_NOUNS[toks[c.end]]
      if (feature && !negated(toks, i)) {
        // "red cap with white warts": the feature belongs to the part named before it
        const part = nearestPart(partList.filter((p) => p.i < i), i, c.end + 1) ?? 'cap'
        if (part === 'cap') add('capTexture', `${c.text} ${feature}`)
        else if (part === 'stem') add('stemFeatures', `${c.text} ${feature}`)
        for (let k = i; k <= c.end; k++) used.add(k)
        i = c.end
        continue
      }
      if (!negated(toks, i)) {
        const part = nearestPart(partList, i, c.end)
        const key = part === 'cap' ? 'capColor' : part === 'gills' ? 'gillColor' : part === 'stem' ? 'stemColor' : part === 'spore' ? 'sporePrint' : null
        if (key === 'sporePrint') set(key, c.text)
        else if (key) add(key, c.text)
      }
      for (let k = i; k < c.end; k++) used.add(k)
      i = c.end - 1
    }

    // --- "heart shaped", "shaped like a fan"
    toks.forEach((t, i) => {
      if (t !== 'shaped' && t !== 'shape') return
      let w = -1
      if (i > 0 && !NOT_SHAPES.has(toks[i - 1]) && /^[a-z]+$/.test(toks[i - 1])) w = i - 1
      else if (toks[i + 1] === 'like') w = ['a', 'an', 'the'].includes(toks[i + 2]) ? i + 3 : i + 2
      const word = toks[w]
      if (!word || NOT_SHAPES.has(word) || !/^[a-z]+$/.test(word) || negated(toks, Math.min(i, w))) return
      const part = nearestPart(partList, Math.min(i, w), Math.max(i, w) + 1) ?? 'cap'
      const shape = SHAPES[word] ?? SHAPE_NOUNS[word] ?? `${word}-shaped`
      if (part === 'cap') add('capShape', shape)
      else if (part === 'stem') add('stemFeatures', shape)
      else return
      used.add(i)
      used.add(w)
    })

    // --- textures and shapes to the nearest part
    toks.forEach((t, i) => {
      if (used.has(i) || negated(toks, i)) return
      const tex = TEXTURES[t]
      const shape = SHAPES[t]
      if (!tex && !shape) return
      const part = nearestPart(partList, i, i + 1) ?? 'cap'
      if (tex) {
        if (part === 'cap') add('capTexture', tex)
        else if (part === 'stem') add('stemFeatures', tex)
      } else if (shape && part === 'cap') {
        if (t === 'flat' && /\b(ground|log|rock)\b/.test(sentence)) return
        add('capShape', shape)
      }
    })

    // --- underside type and gill attachment
    toks.forEach((t, i) => {
      if (negated(toks, i)) return
      if (t === 'gills' || t === 'gill' || t === 'lamellae') { if (!out.underside || out.underside === 'gills') set('underside', 'gills') }
      else if (t === 'pores' || t === 'tubes' || t === 'polypore') set('underside', 'pores')
      else if (t === 'teeth' || t === 'spines' || t === 'toothed') set('underside', 'teeth')
      else if (t === 'falsegills' || t === 'ridges' || t === 'veins') set('underside', 'ridges')
      if (t === 'decurrent' || (t === 'running' && toks[i + 1] === 'down') || (t === 'runs' && toks[i + 1] === 'down')) set('gillAttachment', 'decurrent')
      else if (t === 'adnate') set('gillAttachment', 'adnate')
      else if (t === 'adnexed') set('gillAttachment', 'adnexed')
      else if (t === 'sinuate' || t === 'notched' || t === 'emarginate') set('gillAttachment', 'notched')
      else if (t === 'free' && toks.slice(Math.max(0, i - 3), i + 4).some((w) => w === 'gills' || w === 'gill')) set('gillAttachment', 'free')
    })

    // --- stem features
    toks.forEach((t, i) => {
      let f: string | null = null
      if ((t === 'ring' || t === 'annulus' || t === 'skirt') && toks[i - 1] !== 'fairy' && !(toks[i - 1] === 'a' && toks[i - 2] === 'in')) f = 'ring'
      else if (t === 'volva' || ((t === 'sac' || t === 'cup') && toks.slice(Math.max(0, i - 3), i + 4).includes('base'))) f = 'volva'
      else if (t === 'bulbous' || t === 'bulb') f = 'bulbous base'
      else if (t === 'hollow') f = 'hollow'
      else if (t === 'reticulate' || t === 'reticulation' || t === 'netting' || t === 'netted') f = 'reticulate'
      else if (t === 'scabers') f = 'scabers'
      else if (t === 'club' || t === 'clavate') f = 'club-shaped'
      if (!f) return
      add('stemFeatures', negated(toks, i) ? `no ${f}` : f)
    })

    // --- growth habit
    toks.forEach((t, i) => {
      if (negated(toks, i)) return
      if (['solitary', 'alone', 'singly', 'single'].includes(t)) set('growth', 'solitary')
      else if (t === 'scattered') set('growth', 'scattered')
      else if (['clustered', 'cluster', 'clusters', 'caespitose', 'clump', 'clumps', 'bunch', 'tufts', 'fused'].includes(t)) set('growth', 'clustered')
      else if (['gregarious', 'troop', 'troops', 'groups', 'group'].includes(t)) set('growth', 'in groups')
      else if (t === 'fairyring' || (t === 'ring' && toks[i - 1] === 'a' && toks[i - 2] === 'in')) set('growth', 'fairy ring')
      else if (['shelving', 'shelves', 'overlapping', 'imbricate', 'tiers', 'tiered'].includes(t)) set('growth', 'shelving')
    })

    // --- habitat
    if (/\bmixed (woods|wood|forest|forests|woodland|stand)\b/.test(sentence)) set('habitat', 'mixed woods')
    else if (/\b(conifer|coniferous|evergreen|pine|spruce|fir) (forest|woods|woodland|stand)\b/.test(sentence)) set('habitat', 'conifer forest')
    else if (/\b(hardwood|deciduous|oak|beech|maple) (forest|woods|woodland|stand)\b/.test(sentence)) set('habitat', 'hardwood forest')
    else if (/\b(lawn|lawns|grass|grassy|yard)\b/.test(sentence)) set('habitat', 'lawn/grass')
    else if (/\b(meadow|field|pasture|prairie)\b/.test(sentence)) set('habitat', 'meadow')
    else if (/\b(bog|swamp|marsh|wetland|stream|creek)\b/.test(sentence)) set('habitat', 'wetland')
    else if (/\b(trail|trailside|path|roadside)\b/.test(sentence)) set('habitat', 'trailside')
    else if (/\b(park|garden|urban|city)\b/.test(sentence)) set('habitat', 'urban/park')

    // --- host trees: any tree named, unless negated ("no pines around")
    const trees: string[] = []
    toks.forEach((t, i) => {
      let tree = TREES[t]
      if (!tree || negated(toks, i)) return
      if (t === 'douglas') tree = 'Douglas fir'
      else if ((t === 'fir' || t === 'firs') && toks[i - 1] === 'douglas') return
      // "chestnut brown" is a colour
      if (t === 'chestnut' && COLORS.has(toks[i + 1])) return
      if (!trees.includes(tree)) trees.push(tree)
    })
    for (const t of trees) add('hostTree', t)

    // --- substrate
    const wood = /\b(log|logs|stump|stumps|wood|branch|branches|stick|sticks|twig|twigs|trunk|snag|deadfall)\b/
    if (/\b(dung|manure|poop|woodchips|mulch)\b/.test(sentence)) set('substrate', 'dung/wood chips')
    else if (/\bleaflitter\b|\b(fallen|dead) leaves\b|\bin the leaves\b|\bpine needles\b|\bneedles\b/.test(sentence)) set('substrate', 'leaf litter')
    else if (/\bmoss\b|\bmossy\b/.test(sentence)) set('substrate', 'moss')
    else if (/\b(living|live) (tree|trees|trunk|oak|maple|birch|beech)\b|\bon a (living|live)\b/.test(sentence)) set('substrate', 'living tree')
    else if (wood.test(sentence) && /\b(on|from|growing|attached)\b/.test(sentence)) {
      const kind = trees.find((t) => CONIFERS.has(t)) ? 'decaying conifer'
        : trees.length || /\bhardwood\b/.test(sentence) ? 'hardwood log'
          : /\b(conifer|coniferous)\b/.test(sentence) ? 'decaying conifer' : 'dead wood'
      set('substrate', kind)
    } else if (/\b(soil|dirt|ground|terrestrial)\b/.test(sentence) && /\b(on|in|from|out of|growing)\b/.test(sentence)) set('substrate', 'soil')
  }

  for (const [k, v] of Object.entries(multi) as [FieldKey, string[]][]) out[k] = v.join(', ')
  // "it has a ring" with "ring" and "no ring" both said: keep the last word on it
  if (out.stemFeatures?.includes('no ring') && /(^|, )ring(,|$)/.test(out.stemFeatures)) {
    out.stemFeatures = out.stemFeatures.split(', ').filter((f) => f !== 'ring').join(', ')
  }
  return out
}

/**
 * Which extracted values to write into a find's form.
 * `ownedByVoice` holds the values this recording already wrote, so later speech can refine them;
 * anything the user typed (a non-empty value voice did not write) is left alone.
 */
export function voicePatch(current: FieldNotes, extracted: Extracted, ownedByVoice: Extracted = {}): Extracted {
  const patch: Extracted = {}
  for (const [k, v] of Object.entries(extracted) as [FieldKey, string][]) {
    const cur = (current[k] ?? '').trim()
    if (!v || cur === v) continue
    if (!cur || cur === ownedByVoice[k]) patch[k] = v
  }
  return patch
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Values for the user's own fields (Settings → Field form): one of the field's quick picks
 * ("taste mild" when mild is a pick), or whatever follows the field's name up to the end of
 * the phrase ("collector is Sam" -> "Sam"). The last mention wins.
 */
export function extractCustomFields(text: string, fields: { key: string; label: string; options?: string[] }[]): Record<string, string> {
  const out: Record<string, string> = {}
  if (!text?.trim()) return out
  const lower = text.toLowerCase()
  for (const f of fields) {
    const label = f.label.toLowerCase().trim()
    if (!label) continue
    const re = new RegExp(`\\b${escapeRe(label)}\\b\\s*(?:is|was|are|were|of|:|-)?\\s*([^.,;!?]*)`, 'gi')
    let best: { at: number; value: string } | null = null
    for (const m of lower.matchAll(re)) {
      const after = m[1].trim()
      if (!after) continue
      const opt = f.options?.find((o) => new RegExp(`^(?:a |an |very |quite |slightly )?${escapeRe(o.toLowerCase())}\\b`).test(after))
      const value = opt ?? text.slice(m.index! + m[0].length - m[1].length, m.index! + m[0].length).trim().split(/\s+/).slice(0, 4).join(' ')
      if (value) best = { at: m.index!, value }
    }
    // A quick pick said without the field name ("it tastes acrid"), only when the pick is distinctive.
    if (!best && f.options?.length) {
      for (const o of f.options) {
        if (o.length < 4) continue
        const at = lower.search(new RegExp(`\\b${escapeRe(o.toLowerCase())}\\b`))
        if (at >= 0 && (!best || at > best.at)) best = { at, value: o }
      }
    }
    if (best) out[f.key] = best.value
  }
  return out
}
