// Mycology vocabulary for speech-to-text.
// 1. buildWhisperPrompt(): a short "previous transcript" Whisper is conditioned on, so it
//    favours words like stipe, umbo and Latin binomials (Whisper's initial-prompt trick).
// 2. correctTranscript(): a post-pass that snaps near-miss Latin names to known species and
//    fixes a few common mishearings. Runs on both Whisper and Web Speech output.

/** Terms Whisper should spell the mycology way. Used in the prompt. */
export const GLOSSARY = [
  'pileus', 'stipe', 'umbo', 'umbonate', 'annulus', 'volva', 'partial veil', 'universal veil', 'cortina',
  'lamellae', 'gills adnate', 'adnexed', 'decurrent', 'free gills', 'pores', 'teeth', 'hymenium',
  'spore print', 'basidiospores', 'mycelium', 'hyphae', 'rhizomorphs', 'sclerotium', 'fruiting body',
  'mycorrhizal', 'saprobic', 'conifer', 'hardwood', 'substrate', 'duff', 'KOH', 'Melzer\'s reagent',
  'amyloid', 'striate', 'glutinous', 'viscid', 'fibrillose', 'squamules', 'bruising', 'latex',
]

/**
 * Common North American and European foray species (genus + epithet). The first
 * PROMPT_SPECIES_COUNT also go in the Whisper prompt; all of them are used by correctTranscript.
 */
export const SPECIES = [
  // Prompted (keep the most frequently recorded first)
  'Amanita muscaria', 'Cantharellus cibarius', 'Boletus edulis', 'Morchella esculenta', 'Laetiporus sulphureus',
  'Pleurotus ostreatus', 'Hericium erinaceus', 'Grifola frondosa', 'Trametes versicolor', 'Ganoderma applanatum',
  'Russula emetica', 'Lactarius deliciosus', 'Suillus luteus', 'Armillaria mellea', 'Coprinus comatus',
  'Agaricus campestris', 'Lycoperdon perlatum', 'Calvatia gigantea', 'Hypomyces lactifluorum', 'Craterellus cornucopioides',
  'Amanita phalloides', 'Amanita bisporigera', 'Galerina marginata', 'Gyromitra esculenta', 'Leccinum scabrum',
  // Correction only
  'Agaricus arvensis', 'Agaricus augustus', 'Agaricus bisporus', 'Agaricus bitorquis', 'Agaricus silvicola', 'Agaricus xanthodermus',
  'Aleuria aurantia', 'Amanita caesarea', 'Amanita flavoconia', 'Amanita fulva', 'Amanita jacksonii', 'Amanita pantherina',
  'Amanita rubescens', 'Amanita vaginata', 'Amanita virosa', 'Amanita citrina', 'Amanita frostiana', 'Amanita ocreata',
  'Armillaria ostoyae', 'Armillaria gallica', 'Auricularia auricula-judae', 'Auricularia americana', 'Bjerkandera adusta',
  'Boletus barrowsii', 'Boletus rex-veris', 'Boletus subcaerulescens', 'Butyriboletus frostii', 'Bovista plumbea',
  'Calocera viscosa', 'Calvatia cyathiformis', 'Cantharellus formosus', 'Cantharellus cinnabarinus', 'Cantharellus lateritius',
  'Chlorociboria aeruginascens', 'Chlorophyllum molybdites', 'Chlorophyllum rhacodes', 'Chroogomphus rutilus', 'Clathrus ruber',
  'Clavaria fragilis', 'Clavulina cristata', 'Clitocybe nuda', 'Clitocybe dealbata', 'Clitocybe odora', 'Coprinellus micaceus',
  'Coprinopsis atramentaria', 'Cortinarius violaceus', 'Cortinarius caperatus', 'Craterellus tubaeformis', 'Crucibulum laeve',
  'Cyathus striatus', 'Daedaleopsis confragosa', 'Entoloma abortivum', 'Fistulina hepatica', 'Flammulina velutipes',
  'Fomes fomentarius', 'Fomitopsis pinicola', 'Fomitopsis betulina', 'Ganoderma lucidum', 'Ganoderma tsugae', 'Geastrum saccatum',
  'Gomphus clavatus', 'Gymnopilus junonius', 'Gymnopus dryophilus', 'Gyromitra infula', 'Gyroporus castaneus', 'Helvella crispa',
  'Helvella lacunosa', 'Hericium coralloides', 'Hericium americanum', 'Hydnellum peckii', 'Hydnum repandum', 'Hydnum umbilicatum',
  'Hygrocybe conica', 'Hygrocybe coccinea', 'Hygrocybe miniata', 'Hygrophoropsis aurantiaca', 'Hygrophorus russula',
  'Hypholoma fasciculare', 'Hypholoma capnoides', 'Hypomyces chrysospermus', 'Inocybe geophylla', 'Kuehneromyces mutabilis',
  'Laccaria amethystina', 'Laccaria laccata', 'Laccaria bicolor', 'Lactarius indigo', 'Lactarius torminosus', 'Lactarius rufus',
  'Lactarius volemus', 'Lactifluus volemus', 'Lactarius rubidus', 'Laetiporus cincinnatus', 'Laetiporus conifericola',
  'Leccinum aurantiacum', 'Leccinum versipelle', 'Leccinum insigne', 'Lentinula edodes', 'Lepiota cristata', 'Lepista nuda',
  'Leucoagaricus leucothites', 'Lycoperdon pyriforme', 'Macrolepiota procera', 'Marasmius oreades', 'Marasmius rotula',
  'Megacollybia rodmanii', 'Meripilus sumstinei', 'Morchella americana', 'Morchella elata', 'Morchella importuna',
  'Mycena haematopus', 'Mycena galericulata', 'Mycena leaiana', 'Omphalotus illudens', 'Omphalotus olearius', 'Panaeolus foenisecii',
  'Panellus stipticus', 'Paxillus involutus', 'Phaeolus schweinitzii', 'Phallus impudicus', 'Phallus ravenelii', 'Pholiota squarrosa',
  'Piptoporus betulinus', 'Pleurotus pulmonarius', 'Pleurotus populinus', 'Pluteus cervinus', 'Polyporus squamosus',
  'Cerioporus squamosus', 'Psathyrella candolleana', 'Psilocybe cyanescens', 'Psilocybe cubensis', 'Ramaria botrytis',
  'Ramaria formosa', 'Rhizopogon roseolus', 'Russula brevipes', 'Russula cyanoxantha', 'Russula virescens', 'Russula xerampelina',
  'Sarcoscypha coccinea', 'Sarcoscypha austriaca', 'Scleroderma citrinum', 'Schizophyllum commune', 'Sparassis crispa',
  'Sparassis spathulata', 'Stereum hirsutum', 'Stereum ostrea', 'Strobilomyces strobilaceus', 'Stropharia rugosoannulata',
  'Stropharia aeruginosa', 'Suillus americanus', 'Suillus brevipes', 'Suillus granulatus', 'Suillus grevillei', 'Suillus lakei',
  'Suillus pictus', 'Suillus spraguei', 'Suillus tomentosus', 'Tapinella atrotomentosa', 'Trametes hirsuta', 'Trametes gibbosa',
  'Tremella mesenterica', 'Tricholoma magnivelare', 'Tricholoma murrillianum', 'Tricholoma equestre', 'Tricholoma flavovirens',
  'Tricholomopsis rutilans', 'Turbinellus floccosus', 'Tylopilus felleus', 'Verpa bohemica', 'Xerocomellus chrysenteron',
  'Xylaria polymorpha', 'Xylaria hypoxylon',
]
export const PROMPT_SPECIES_COUNT = 25

/** Split free text (e.g. a settings textarea) into names: one per line or comma separated. */
export function parseNameList(text: string | undefined | null): string[] {
  return (text ?? '').split(/[\n,;]+/).map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean)
}

function uniq(names: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const n of names) {
    const k = n.toLowerCase()
    if (!seen.has(k)) { seen.add(k); out.push(n) }
  }
  return out
}

/**
 * Text Whisper is conditioned on. Written like a previous field note so the model copies its
 * spelling and capitalisation. `extra` (names from this foray and the user's vocabulary) comes
 * before the default species because the worker trims the prompt from the end to fit Whisper's
 * prompt budget.
 */
export function buildWhisperPrompt(extra: string[] = []): string {
  const names = uniq([...extra, ...SPECIES.slice(0, PROMPT_SPECIES_COUNT)])
  return [
    'Mushroom foray field notes.',
    'Cap convex with a low umbo, gills adnate, stipe with an annulus and a volva at the base, spore print white.',
    `Terms: ${GLOSSARY.join(', ')}.`,
    `Species: ${names.join(', ')}.`,
  ].join(' ')
}

// ---------- correction pass ----------

// Mishearings that are not real English words (or are very unlikely in a field note).
const FIXES: [RegExp, string][] = [
  [/\bstypes\b/gi, 'stipes'],
  [/\bstype\b/gi, 'stipe'],
  [/\bum[- ]?bo(w|e)?\b/gi, 'umbo'],
  [/\bum[- ]?bo(w|e)?nate\b/gi, 'umbonate'],
  [/\bvolvo\b/gi, 'volva'],
  [/\banulus\b/gi, 'annulus'],
  [/\bspoor(s)? print\b/gi, 'spore$1 print'],
  [/\bspoors\b/gi, 'spores'],
  [/\bmy[- ]?celium\b/gi, 'mycelium'],
  [/\bmy[- ]?corrhizal\b/gi, 'mycorrhizal'],
  [/\bdecurrant\b/gi, 'decurrent'],
  [/\badnait\b/gi, 'adnate'],
  [/\blamelli\b/gi, 'lamellae'],
  [/\bk o h\b/gi, 'KOH'],
]

const lettersOnly = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')

/** Edit distance; stops early and returns max + 1 once the distance must exceed `max`. */
export function levenshtein(a: string, b: string, max = Infinity): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > max) return max + 1
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      if (cur[j] < rowMin) rowMin = cur[j]
    }
    if (rowMin > max) return max + 1
    prev = cur
  }
  return prev[b.length]
}

interface Entry { name: string; key: string; genusKey: string; epithetKey: string }

function buildIndex(names: string[]) {
  const species: Entry[] = []
  const genera = new Map<string, string>() // key -> Genus
  for (const raw of uniq(names)) {
    const parts = raw.trim().split(/\s+/)
    if (!parts[0] || lettersOnly(parts[0]).length < 4) continue
    const genus = parts[0][0].toUpperCase() + parts[0].slice(1).toLowerCase()
    genera.set(lettersOnly(genus), genus)
    if (parts.length >= 2) {
      const name = [genus, ...parts.slice(1)].join(' ')
      species.push({ name, key: lettersOnly(name), genusKey: lettersOnly(genus), epithetKey: lettersOnly(parts.slice(1).join('')) })
    }
  }
  return { species, genera }
}

const defaultIndex = buildIndex(SPECIES)

/** Similarity 0..1, or -1 when it is certainly below `min`. */
function sim(a: string, b: string, min: number): number {
  const len = Math.max(a.length, b.length)
  const d = levenshtein(a, b, Math.floor((1 - min) * len))
  const s = 1 - d / len
  return s >= min ? s : -1
}

interface Tok { lead: string; core: string; trail: string }
function splitTok(w: string): Tok {
  const m = w.match(/^([^\p{L}]*)(.*?)([^\p{L}]*)$/u)!
  return { lead: m[1], core: m[2], trail: m[3] }
}

/** A merged window must start and end like the candidate, so a neighbouring word ("an", "is") is not swallowed. */
function edgesOk(win: Tok[], key: string): boolean {
  if (win.length < 2) return true
  const first = lettersOnly(win[0].core)
  const last = lettersOnly(win[win.length - 1].core)
  return levenshtein(first, key.slice(0, first.length)) <= Math.floor(first.length / 3)
    && levenshtein(last, key.slice(-last.length)) <= Math.floor(last.length / 3)
}

const SPECIES_MIN_SIM = 0.82
const GENUS_MIN_SIM = 0.85

/**
 * Fix common mishearings and snap Latin names to known spellings.
 * `extra` adds names (this foray's species guesses, the user's vocabulary) to the built-in list.
 */
export function correctTranscript(text: string, extra: string[] = []): string {
  if (!text) return text
  let out = text
  for (const [re, rep] of FIXES) {
    out = out.replace(re, (m, ...groups) => {
      const r = rep.replace(/\$1/g, typeof groups[0] === 'string' ? groups[0] : '')
      return /^[A-Z][a-z]/.test(m) ? r[0].toUpperCase() + r.slice(1) : r
    })
  }

  const idx = extra.length ? buildIndex([...extra, ...SPECIES]) : defaultIndex
  const words = out.split(/\s+/).filter(Boolean)
  const toks = words.map(splitTok)
  const result: string[] = []
  let i = 0
  while (i < toks.length) {
    let best: { n: number; name: string; score: number } | null = null
    // Binomials, allowing Whisper to have split or merged the words (1..4 tokens).
    for (let n = 1; n <= 4 && i + n <= toks.length; n++) {
      // Do not reach across sentence punctuation.
      if (n > 1 && /[.!?;:,]/.test(toks[i + n - 2].trail)) break
      const win = toks.slice(i, i + n)
      const key = win.map((t) => lettersOnly(t.core)).join('')
      if (key.length < 8) continue
      const firstKey = lettersOnly(win[0].core)
      for (const e of idx.species) {
        if (Math.abs(e.key.length - key.length) > 4) continue
        const s = sim(key, e.key, SPECIES_MIN_SIM)
        if (s < SPECIES_MIN_SIM || !edgesOk(win, e.key)) continue
        // A known genus followed by an unknown epithet is probably a species we do not list: leave it.
        if (n >= 2 && idx.genera.has(firstKey) && firstKey === e.genusKey) {
          const epi = win.slice(1).map((t) => lettersOnly(t.core)).join('')
          if (levenshtein(epi, e.epithetKey) > 2) continue
        }
        if (!best || s > best.score || (s === best.score && n < best.n)) best = { n, name: e.name, score: s }
      }
    }
    // Genus alone (1..3 tokens).
    if (!best) {
      for (let n = 1; n <= 3 && i + n <= toks.length; n++) {
        if (n > 1 && /[.!?;:,]/.test(toks[i + n - 2].trail)) break
        const win = toks.slice(i, i + n)
        const key = win.map((t) => lettersOnly(t.core)).join('')
        if (key.length < 5) continue
        const exact = idx.genera.get(key)
        if (exact) {
          // Single word: only fix capitalisation. Several words merged into a genus need 7+ letters.
          if (n === 1 || (key.length >= 7 && edgesOk(win, key))) { best = { n, name: exact, score: 1 }; break }
          continue
        }
        if (key.length < 7) continue
        for (const [gk, g] of idx.genera) {
          if (Math.abs(gk.length - key.length) > 2) continue
          const s = sim(key, gk, GENUS_MIN_SIM)
          if (s >= GENUS_MIN_SIM && edgesOk(win, gk) && (!best || s > best.score)) best = { n, name: g, score: s }
        }
      }
    }
    if (best) {
      result.push(toks[i].lead + best.name + toks[i + best.n - 1].trail)
      i += best.n
    } else {
      result.push(words[i])
      i++
    }
  }
  return result.join(' ')
}
