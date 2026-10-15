// ID key: narrows a find down to a shortlist of species, one question at a time.
// A multi-access key rather than a fixed yes/no tree: any question can be answered in any
// order, "not sure" skips it, and one wrong answer only demotes a species instead of losing it.
// Each step asks whichever unanswered question would rule out the most of the species still in
// the running. Answers the find's field form already holds are filled in first.
// DOM-free so tests/idkey.test.mjs can run it under node --experimental-strip-types.
import type { FieldNotes } from './db.ts'
import { SPECIES_LINES } from './idKeyData.ts'

export type QuestionId =
  | 'group' | 'sp' | 'att' | 'ring' | 'volva' | 'milk' | 'scabers' | 'slimy'
  | 'stain' | 'odor' | 'sub' | 'host' | 'col' | 'grow' | 'sz'

export interface KeyOption { id: string; label: string; hint?: string }
export interface KeyQuestion {
  id: QuestionId
  title: string
  /** One line on how to check, shown under the question. */
  help?: string
  /** Short name for the answers list ("Spore print: white"). */
  short: string
  options: KeyOption[]
  /** Option pairs close enough that confusing them should not count against a species. */
  near?: [string, string][]
}

const YES_NO: KeyOption[] = [{ id: 'y', label: 'Yes' }, { id: 'n', label: 'No' }]

export const QUESTIONS: KeyQuestion[] = [
  {
    id: 'group', short: 'Type', title: 'What kind of mushroom is it?', help: 'Look under the cap, or at the overall shape.',
    options: [
      { id: 'gills', label: 'Gills', hint: 'Thin blades under a cap' },
      { id: 'bolete', label: 'Spongy pores', hint: 'Soft cap and stem, sponge underneath' },
      { id: 'shelf', label: 'Shelf or bracket', hint: 'Grows out of wood, often tough' },
      { id: 'teeth', label: 'Teeth or spines', hint: 'Spines hang down' },
      { id: 'ridges', label: 'Blunt ridges', hint: 'Forked folds or smooth, like a chanterelle' },
      { id: 'ball', label: 'Ball or star', hint: 'Puffball, earthball, earthstar' },
      { id: 'coral', label: 'Coral or club', hint: 'Branches or upright fingers' },
      { id: 'jelly', label: 'Jelly', hint: 'Rubbery or gelatinous' },
      { id: 'cup', label: 'Cup or disc', hint: "Includes bird's nests" },
      { id: 'morel', label: 'Honeycomb or saddle', hint: 'Morels, false morels, saddles' },
      { id: 'stinkhorn', label: 'Stinkhorn', hint: 'Slimy, smelly stalk or cage' },
      { id: 'other', label: 'Mold on a mushroom', hint: 'A crust covering another mushroom' },
    ],
  },
  {
    id: 'sp', short: 'Spore print', title: 'What color is the spore print?', help: 'Leave the cap gills-down on paper for a few hours.',
    options: [
      { id: 'white', label: 'White' }, { id: 'cream', label: 'Cream or yellowish' }, { id: 'pink', label: 'Pink' },
      { id: 'brown', label: 'Brown' }, { id: 'rust', label: 'Rusty brown' }, { id: 'purple', label: 'Purple-brown' },
      { id: 'olive', label: 'Olive-brown' }, { id: 'black', label: 'Black' }, { id: 'green', label: 'Green' },
    ],
    near: [['white', 'cream'], ['cream', 'pink'], ['brown', 'rust'], ['brown', 'purple'], ['brown', 'olive'], ['purple', 'black']],
  },
  {
    id: 'att', short: 'Gills', title: 'How do the gills meet the stem?',
    options: [
      { id: 'free', label: "Don't reach the stem" },
      { id: 'attached', label: 'Attached to the stem' },
      { id: 'decurrent', label: 'Run down the stem' },
    ],
    near: [['free', 'attached'], ['attached', 'decurrent']],
  },
  { id: 'ring', short: 'Ring', title: 'Is there a ring or skirt on the stem?', options: YES_NO },
  { id: 'volva', short: 'Cup at base', title: 'Is there a cup or sack at the base of the stem?', help: 'Dig the whole base up to check.', options: YES_NO },
  { id: 'milk', short: 'Milk', title: 'Does it ooze milk or juice when cut?', help: 'Nick a gill or the flesh with a knife.', options: YES_NO },
  { id: 'scabers', short: 'Scabers', title: 'Does the stem have dark, rough scales (scabers)?', options: YES_NO },
  { id: 'slimy', short: 'Slimy', title: 'Is the cap slimy or sticky?', help: 'Touch it with a damp finger.', options: YES_NO },
  {
    id: 'stain', short: 'Bruising', title: 'Does it change color when cut or bruised?', help: 'Wait a minute after cutting.',
    options: [
      { id: 'none', label: 'No change' }, { id: 'blue', label: 'Blue' }, { id: 'red', label: 'Red or pink' },
      { id: 'yellow', label: 'Yellow' }, { id: 'brown', label: 'Brown' }, { id: 'black', label: 'Gray or black' },
      { id: 'green', label: 'Green' },
    ],
    near: [['brown', 'black'], ['red', 'brown']],
  },
  {
    id: 'odor', short: 'Smell', title: 'How does it smell?', help: 'Crush a little of the cap.',
    options: [
      { id: 'none', label: 'Nothing special' }, { id: 'anise', label: 'Anise or licorice' }, { id: 'farina', label: 'Flour or cucumber' },
      { id: 'fruity', label: 'Fruity or apricot' }, { id: 'sweet', label: 'Sweet or spicy' }, { id: 'garlic', label: 'Garlic' },
      { id: 'fishy', label: 'Fishy' }, { id: 'chemical', label: 'Chemical or inky' }, { id: 'foul', label: 'Rotten' },
    ],
    near: [['fruity', 'sweet']],
  },
  {
    id: 'sub', short: 'Growing on', title: 'What is it growing on?',
    options: [
      { id: 'wood', label: 'Wood', hint: 'Logs, stumps, trees, wood chips' }, { id: 'ground', label: 'Soil or leaf litter' },
      { id: 'grass', label: 'Grass' }, { id: 'dung', label: 'Dung' }, { id: 'mushroom', label: 'Another mushroom' },
    ],
    near: [['ground', 'grass'], ['ground', 'dung']],
  },
  {
    id: 'host', short: 'Trees', title: 'What trees are nearby?',
    options: [{ id: 'conifer', label: 'Conifers', hint: 'Pine, spruce, fir, hemlock' }, { id: 'hardwood', label: 'Hardwoods', hint: 'Oak, birch, beech, maple' }],
  },
  {
    id: 'col', short: 'Color', title: 'What color is the cap?', help: 'Or the main color, if it has no cap.',
    options: [
      { id: 'white', label: 'White' }, { id: 'yellow', label: 'Yellow' }, { id: 'orange', label: 'Orange' }, { id: 'red', label: 'Red' },
      { id: 'pink', label: 'Pink' }, { id: 'purple', label: 'Purple' }, { id: 'blue', label: 'Blue' }, { id: 'green', label: 'Green' },
      { id: 'brown', label: 'Brown or tan' }, { id: 'gray', label: 'Gray' }, { id: 'black', label: 'Black' },
    ],
    near: [['yellow', 'orange'], ['orange', 'red'], ['red', 'pink'], ['pink', 'purple'], ['purple', 'blue'], ['blue', 'green'],
      ['orange', 'brown'], ['brown', 'gray'], ['gray', 'black'], ['white', 'gray'], ['yellow', 'brown'], ['red', 'brown']],
  },
  {
    id: 'grow', short: 'Growth', title: 'Is it growing alone or in a cluster?',
    options: [{ id: 'single', label: 'Alone or scattered' }, { id: 'cluster', label: 'Clustered, stems joined' }],
  },
  {
    id: 'sz', short: 'Size', title: 'How big is it across?',
    options: [{ id: 's', label: 'Under 3 cm' }, { id: 'm', label: '3 to 10 cm' }, { id: 'l', label: 'Over 10 cm' }],
    near: [['s', 'm'], ['m', 'l']],
  },
]

export const QUESTION = Object.fromEntries(QUESTIONS.map((q) => [q.id, q])) as Record<QuestionId, KeyQuestion>
export const optionLabel = (q: QuestionId, v: string) => QUESTION[q].options.find((o) => o.id === v)?.label ?? v

// ---------- species table ----------

export interface KeySpecies {
  name: string
  common: string
  aka: string[]
  traits: Partial<Record<QuestionId, string[]>>
  danger?: 'deadly' | 'toxic'
}

export function parseSpeciesLines(text: string): KeySpecies[] {
  const out: KeySpecies[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const [name, common, groups, traitText = '', aka = ''] = line.split('|').map((s) => s.trim())
    const sp: KeySpecies = { name, common, aka: aka ? aka.split(',').map((s) => s.trim()) : [], traits: { group: groups.split(',') } }
    for (const tok of traitText.split(/\s+/).filter(Boolean)) {
      if (tok === 'deadly' || tok === 'toxic') { sp.danger = tok; continue }
      const [k, v] = tok.split(':')
      if (!(k in QUESTION) || !v) throw new Error(`${name}: bad trait "${tok}"`)
      const vals = v.split(',')
      for (const x of vals) if (!QUESTION[k as QuestionId].options.some((o) => o.id === x)) throw new Error(`${name}: bad value "${tok}"`)
      sp.traits[k as QuestionId] = vals
    }
    for (const g of sp.traits.group!) if (!QUESTION.group.options.some((o) => o.id === g)) throw new Error(`${name}: bad group "${g}"`)
    // Gilled mushrooms with milk or a volva are the exception; the table lists those.
    if (sp.traits.group!.includes('gills')) {
      sp.traits.milk ??= ['n']
      sp.traits.volva ??= ['n']
    }
    out.push(sp)
  }
  return out
}

export const KEY_SPECIES: KeySpecies[] = parseSpeciesLines(SPECIES_LINES)

// ---------- scoring ----------

export type Answers = Partial<Record<QuestionId, string>>
/** 'not sure' answers, so the question is not asked again. */
export const UNSURE = '?'

/** Odors strong enough that "nothing special" rules a species out. */
const STRONG_ODORS = new Set(['anise', 'garlic', 'fishy', 'chemical', 'foul'])

const isNear = (q: KeyQuestion, a: string, b: string) => !!q.near?.some(([x, y]) => (x === a && y === b) || (x === b && y === a))

/** +1 fits, 0 not recorded, -0.5 close (orange for red), -1 does not fit. */
export function traitFit(sp: KeySpecies, qid: QuestionId, answer: string): -1 | -0.5 | 0 | 1 {
  if (!answer || answer === UNSURE) return 0
  const vals = sp.traits[qid]
  const q = QUESTION[qid]
  if (qid === 'odor' && answer === 'none') return vals?.some((v) => STRONG_ODORS.has(v)) ? -1 : 0
  if (!vals?.length) return 0
  if (vals.includes(answer)) return 1
  if (vals.some((v) => isNear(q, v, answer))) return -0.5
  return -1
}

export interface Match {
  species: KeySpecies
  fits: QuestionId[]
  /** Answers that are close but not quite (orange for a red cap). */
  near: QuestionId[]
  misses: QuestionId[]
}

/** Every species, best first: lowest penalty (a wrong type counts double), then most fits. */
export function rankSpecies(answers: Answers, list: KeySpecies[] = KEY_SPECIES): Match[] {
  const qs = (Object.keys(answers) as QuestionId[]).filter((q) => answers[q] && answers[q] !== UNSURE)
  const matches = list.map((species) => {
    const fits: QuestionId[] = []
    const near: QuestionId[] = []
    const misses: QuestionId[] = []
    for (const q of qs) {
      const f = traitFit(species, q, answers[q]!)
      if (f > 0) fits.push(q)
      else if (f === -1) misses.push(q)
      else if (f < 0) near.push(q)
    }
    return { species, fits, near, misses }
  })
  return matches.sort((a, b) => penalty(a) - penalty(b) || b.fits.length - a.fits.length || a.species.name.localeCompare(b.species.name))
}

export const penalty = (m: Match) => m.misses.length + m.near.length / 2 + (m.misses.includes('group') ? 1 : 0)

/** The species still in the running: nothing contradicts them, and at most one answer is only close. */
export const inRunning = (ranked: Match[]) => ranked.filter((m) => penalty(m) < 1)

// ---------- next question ----------

/**
 * The unanswered question that would leave the fewest species on average, or null when no
 * question would narrow the field further. Expected survivors = Σ P(answer) × survivors(answer),
 * with P(answer) from how the remaining species split across the options.
 */
export function nextQuestion(answers: Answers, ranked: Match[] = rankSpecies(answers)): KeyQuestion | null {
  if (!answers.group) return QUESTION.group
  const best = ranked.length ? penalty(ranked[0]) : 0
  const pool = ranked.filter((m) => penalty(m) <= best + 0.5).map((m) => m.species)
  if (pool.length <= 1) return null
  let pick: KeyQuestion | null = null
  let pickScore = Infinity
  for (const q of QUESTIONS) {
    if (answers[q.id]) continue
    const weight = new Map<string, number>()
    let known = 0
    for (const sp of pool) {
      const vals = sp.traits[q.id]
      if (!vals?.length) continue
      known++
      for (const v of vals) weight.set(v, (weight.get(v) ?? 0) + 1 / vals.length)
    }
    if (known < 2) continue
    let expected = 0
    for (const [opt, w] of weight) {
      // A close answer half-survives; species with nothing recorded survive every answer.
      const survivors = pool.reduce((n, sp) => n + Math.min(1, 1 + traitFit(sp, q.id, opt)), 0)
      expected += (w / known) * survivors
    }
    const score = expected / pool.length
    if (score < 0.9 && score < pickScore - 1e-9) { pick = q; pickScore = score }
  }
  return pick
}

// ---------- the find's field form ----------

const has = (text: string, ...words: string[]) => words.some((w) => new RegExp(`\\b${w}`, 'i').test(text))

const COLOR_WORDS: [string, string[]][] = [
  ['white', ['white', 'ivory', 'cream']], ['yellow', ['yellow', 'gold', 'lemon', 'sulph']], ['orange', ['orange', 'apricot', 'salmon']],
  ['red', ['red', 'scarlet', 'crimson', 'maroon']], ['pink', ['pink', 'rose']], ['purple', ['purple', 'violet', 'lilac', 'lavender']],
  ['blue', ['blue']], ['green', ['green', 'olive']], ['brown', ['brown', 'tan', 'buff', 'beige', 'chestnut', 'cinnamon', 'ochre']],
  ['gray', ['gray', 'grey']], ['black', ['black']],
]

/** Answers the field form already gives, so the key does not ask them again. */
export function answersFromNotes(n: FieldNotes): Answers {
  const a: Answers = {}
  const u = (n.underside ?? '').toLowerCase()
  if (has(u, 'gill')) a.group = 'gills'
  else if (has(u, 'teeth', 'tooth', 'spine')) a.group = 'teeth'
  else if (has(u, 'ridge')) a.group = 'ridges'

  const sp = (n.sporePrint ?? '').toLowerCase()
  if (sp) {
    if (has(sp, 'purple', 'chocolate')) a.sp = 'purple'
    else if (has(sp, 'olive')) a.sp = 'olive'
    else if (has(sp, 'rust', 'orange')) a.sp = 'rust'
    else if (has(sp, 'brown', 'tan')) a.sp = 'brown'
    else if (has(sp, 'black')) a.sp = 'black'
    else if (has(sp, 'pink', 'salmon')) a.sp = 'pink'
    else if (has(sp, 'green')) a.sp = 'green'
    else if (has(sp, 'cream', 'yellow', 'buff')) a.sp = 'cream'
    else if (has(sp, 'white')) a.sp = 'white'
  }

  const att = (n.gillAttachment ?? '').toLowerCase()
  if (has(att, 'decurrent', 'run')) a.att = 'decurrent'
  else if (has(att, 'free')) a.att = 'free'
  else if (has(att, 'adnate', 'adnexed', 'notched', 'sinuate', 'attached')) a.att = 'attached'

  const stem = (n.stemFeatures ?? '').toLowerCase()
  if (has(stem, 'no ring')) a.ring = 'n'
  else if (has(stem, 'ring', 'annul', 'skirt')) a.ring = 'y'
  if (has(stem, 'no volva')) a.volva = 'n'
  else if (has(stem, 'volva', 'sack', 'cup')) a.volva = 'y'
  if (has(stem, 'scaber')) a.scabers = 'y'

  if (has(n.capTexture ?? '', 'slim', 'stick', 'viscid', 'glutinous', 'tacky')) a.slimy = 'y'

  const st = (n.staining ?? '').toLowerCase()
  if (st) {
    if (has(st, 'none', 'no ')) a.stain = 'none'
    else if (has(st, 'blue')) a.stain = 'blue'
    else if (has(st, 'red', 'pink')) a.stain = 'red'
    else if (has(st, 'yellow')) a.stain = 'yellow'
    else if (has(st, 'black', 'gray', 'grey')) a.stain = 'black'
    else if (has(st, 'brown')) a.stain = 'brown'
    else if (has(st, 'green')) a.stain = 'green'
  }

  const od = (n.odor ?? '').toLowerCase()
  if (od) {
    if (has(od, 'anise', 'licorice', 'liquorice', 'almond')) a.odor = 'anise'
    else if (has(od, 'farin', 'flour', 'meal', 'cucumber')) a.odor = 'farina'
    else if (has(od, 'garlic', 'onion')) a.odor = 'garlic'
    else if (has(od, 'fish', 'shrimp', 'crab')) a.odor = 'fishy'
    else if (has(od, 'fruit', 'apricot')) a.odor = 'fruity'
    else if (has(od, 'sweet', 'spic', 'cinnamon', 'maple')) a.odor = 'sweet'
    else if (has(od, 'chemical', 'phenol', 'ink', 'bleach', 'rubber')) a.odor = 'chemical'
    else if (has(od, 'foul', 'rotten', 'putrid', 'carrion')) a.odor = 'foul'
    else if (has(od, 'none', 'mild', 'nothing', 'indistinct', 'mushroomy')) a.odor = 'none'
  }

  const sub = (n.substrate ?? '').toLowerCase()
  if (sub) {
    if (has(sub, 'dung', 'manure')) a.sub = 'dung'
    else if (has(sub, 'mushroom', 'russula', 'bolete')) a.sub = 'mushroom'
    else if (has(sub, 'wood', 'log', 'stump', 'tree', 'branch', 'twig', 'conifer', 'hardwood', 'chips')) a.sub = 'wood'
    else if (has(sub, 'grass', 'lawn')) a.sub = 'grass'
    else if (has(sub, 'soil', 'ground', 'litter', 'moss', 'duff', 'needle')) a.sub = 'ground'
  }
  if (!a.sub && has(n.habitat ?? '', 'lawn', 'grass', 'meadow')) a.sub = 'grass'

  const trees = `${n.hostTree ?? ''} ${n.habitat ?? ''} ${n.substrate ?? ''}`.toLowerCase()
  const conifer = has(trees, 'conifer', 'pine', 'spruce', 'fir', 'hemlock', 'cedar', 'larch', 'douglas', 'redwood')
  const hardwood = has(trees, 'hardwood', 'oak', 'birch', 'beech', 'maple', 'aspen', 'poplar', 'alder', 'ash', 'elm', 'cherry', 'willow')
  if (conifer !== hardwood) a.host = conifer ? 'conifer' : 'hardwood'

  const col = (n.capColor ?? '').toLowerCase()
  const colors = COLOR_WORDS.filter(([, words]) => has(col, ...words)).map(([c]) => c)
  if (colors.length === 1) a.col = colors[0]

  const g = (n.growth ?? '').toLowerCase()
  if (has(g, 'cluster', 'tuft', 'caespitose', 'shelving')) a.grow = 'cluster'
  else if (has(g, 'solitary', 'single', 'alone', 'scattered')) a.grow = 'single'

  const size = (n.capSize ?? '').match(/(\d+(?:\.\d+)?)\s*(mm|cm|in|inch|")?/i)
  if (size) {
    const v = parseFloat(size[1])
    const unit = (size[2] ?? 'cm').toLowerCase()
    const cm = unit === 'mm' ? v / 10 : unit === 'cm' ? v : v * 2.54
    a.sz = cm < 3 ? 's' : cm <= 10 ? 'm' : 'l'
  }
  return a
}

/** What picking a species writes back to the form: its name, plus key answers for empty fields. */
export function pickPatch(name: string, answers: Answers, n: FieldNotes): Partial<FieldNotes> {
  const patch: Partial<FieldNotes> = { speciesGuess: `${name}?` }
  const UNDERSIDE: Record<string, string> = { gills: 'gills', bolete: 'pores', teeth: 'teeth', ridges: 'ridges' }
  if (!n.underside && answers.group && UNDERSIDE[answers.group]) patch.underside = UNDERSIDE[answers.group]
  const SPORE: Record<string, string> = { white: 'white', cream: 'cream', pink: 'pink', brown: 'brown', rust: 'rusty brown', purple: 'purple-brown', olive: 'olive-brown', black: 'black', green: 'green' }
  if (!n.sporePrint && answers.sp && SPORE[answers.sp]) patch.sporePrint = SPORE[answers.sp]
  if (!n.stemFeatures) {
    const feats = [answers.ring === 'y' && 'ring', answers.volva === 'y' && 'volva', answers.scabers === 'y' && 'scabers'].filter(Boolean)
    if (feats.length) patch.stemFeatures = feats.join(', ')
  }
  return patch
}
