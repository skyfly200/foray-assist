// The two documenting scores (ROADMAP Phase 14): Finds and Thoroughness. Pure, so
// tests/score.test.mjs can run it under node --experimental-strip-types.
//
// Thoroughness is how complete one find's record is, as a checklist. Finds counts finds and
// species, but a find only counts once it is at least MIN_THOROUGHNESS complete, so the game
// rewards documenting a find well rather than picking more of them.
import type { FieldNotes } from './db.ts'
import { taxonKey } from './dex.ts'

/** The diagnostic shots the AR guide asks for, in the order it asks. */
export const SHOT_ANGLES = ['cap', 'underside', 'stem', 'habitat'] as const
export type ShotAngle = (typeof SHOT_ANGLES)[number]

export const SHOT_LABELS: Record<ShotAngle, { label: string; hint: string; icon: string }> = {
  cap: { label: 'Cap top', hint: 'Look down on the cap', icon: 'mdi-umbrella-outline' },
  underside: { label: 'Gills or pores', hint: 'Tilt it to show the underside', icon: 'mdi-view-week-outline' },
  stem: { label: 'Stem and base', hint: 'Dig out the base, show the whole stem', icon: 'mdi-format-vertical-align-center' },
  habitat: { label: 'Habitat', hint: 'Step back to show where it grows', icon: 'mdi-tree' },
}

/** A find counts toward the Finds score from this completeness (0..1). */
export const MIN_THOROUGHNESS = 0.5

export interface ScoreFind {
  id: string
  forayId: string
  timestamp: string
  specimenId?: string
  voucherId?: string | null
  latitude?: number
  longitude?: number
  fieldNotes?: FieldNotes
}

export interface ScorePhoto { specimenRowId: string; angle?: ShotAngle }

export interface CheckItem { key: string; label: string; done: boolean }

const filled = (notes: FieldNotes | undefined, keys: (keyof FieldNotes)[]) =>
  keys.some((k) => typeof notes?.[k] === 'string' && (notes[k] as string).trim() !== '')

/**
 * Which shots a find already has. Tagged photos (taken in the guide) fill their angle; untagged
 * photos fill the remaining angles one each, so finds photographed outside the guide still score.
 */
export function shotsDone(photos: ScorePhoto[]): Record<ShotAngle, boolean> {
  const done = Object.fromEntries(SHOT_ANGLES.map((a) => [a, false])) as Record<ShotAngle, boolean>
  let untagged = 0
  for (const p of photos) {
    if (p.angle && p.angle in done) done[p.angle] = true
    else untagged++
  }
  for (const a of SHOT_ANGLES) {
    if (untagged <= 0) break
    if (!done[a]) { done[a] = true; untagged-- }
  }
  return done
}

/** The checklist behind one find's Thoroughness score. */
export function checklist(find: ScoreFind, photos: ScorePhoto[], voiceNotes = 0): CheckItem[] {
  const n = find.fieldNotes
  const shots = shotsDone(photos)
  return [
    ...SHOT_ANGLES.map((a) => ({ key: `shot:${a}`, label: `${SHOT_LABELS[a].label} photo`, done: shots[a] })),
    { key: 'species', label: 'Species guess', done: filled(n, ['speciesGuess']) },
    { key: 'habitat', label: 'Habitat or substrate', done: filled(n, ['habitat', 'substrate', 'hostTree']) },
    { key: 'cap', label: 'Cap details', done: filled(n, ['capShape', 'capColor', 'capSize', 'capTexture']) },
    { key: 'under', label: 'Gill or pore details', done: filled(n, ['underside', 'gillAttachment', 'gillColor']) },
    { key: 'stem', label: 'Stem details', done: filled(n, ['stemSize', 'stemColor', 'stemFeatures']) },
    { key: 'odor', label: 'Odor', done: filled(n, ['odor']) },
    { key: 'sporePrint', label: 'Spore print', done: filled(n, ['sporePrint']) },
    { key: 'location', label: 'Location', done: typeof find.latitude === 'number' && typeof find.longitude === 'number' },
    { key: 'specimenId', label: 'Specimen ID', done: !!(find.specimenId || find.voucherId) },
    { key: 'notes', label: 'Voice or written notes', done: voiceNotes > 0 || filled(n, ['notes']) },
  ]
}

/** 0..1 */
export const thoroughness = (items: CheckItem[]) => (items.length ? items.filter((i) => i.done).length / items.length : 0)

export interface Badge { id: string; label: string; icon: string; earned: boolean; detail: string }

export interface ForayScore { forayId: string; finds: number; species: number; thoroughness: number }

export interface Scores {
  /** Finds that reached MIN_THOROUGHNESS. */
  finds: number
  /** Distinct species among counted finds. */
  species: number
  /** Average completeness over all finds, 0..1. */
  thoroughness: number
  /** Finds at 100%. */
  complete: number
  /** All finds, counted or not. */
  total: number
  perFind: Record<string, number>
  perForay: ForayScore[]
  /** Days in a row with at least one counted find, ending on the latest such day; and the best run. */
  streak: { current: number; best: number }
  badges: Badge[]
}

const day = (iso: string) => iso.slice(0, 10)
const nextDay = (d: string) => new Date(Date.parse(d + 'T00:00:00Z') + 86_400_000).toISOString().slice(0, 10)

function streaks(days: string[]): { current: number; best: number } {
  const sorted = [...new Set(days)].sort()
  let best = 0, run = 0, prev = ''
  for (const d of sorted) {
    run = prev && nextDay(prev) === d ? run + 1 : 1
    best = Math.max(best, run)
    prev = d
  }
  return { current: run, best }
}

export function computeScores(finds: ScoreFind[], photos: ScorePhoto[], voiceCounts: Record<string, number> = {}): Scores {
  const byFind = new Map<string, ScorePhoto[]>()
  for (const p of photos) byFind.set(p.specimenRowId, [...(byFind.get(p.specimenRowId) ?? []), p])

  const perFind: Record<string, number> = {}
  const foray = new Map<string, { finds: number; species: Set<string>; sum: number; n: number }>()
  const species = new Set<string>()
  const countedDays: string[] = []
  let counted = 0, complete = 0, sum = 0, allShots = 0, sporePrints = 0

  for (const f of finds) {
    const items = checklist(f, byFind.get(f.id) ?? [], voiceCounts[f.id] ?? 0)
    const t = thoroughness(items)
    perFind[f.id] = t
    sum += t
    if (t === 1) complete++
    if (items.filter((i) => i.key.startsWith('shot:')).every((i) => i.done)) allShots++
    if (items.find((i) => i.key === 'sporePrint')?.done) sporePrints++
    const fs = foray.get(f.forayId) ?? { finds: 0, species: new Set<string>(), sum: 0, n: 0 }
    fs.sum += t
    fs.n++
    if (t >= MIN_THOROUGHNESS) {
      counted++
      fs.finds++
      countedDays.push(day(f.timestamp))
      const k = taxonKey(f.fieldNotes?.speciesGuess)
      if (k) { species.add(k); fs.species.add(k) }
    }
    foray.set(f.forayId, fs)
  }

  const streak = streaks(countedDays)
  const badge = (id: string, label: string, icon: string, have: number, need: number, what: string): Badge =>
    ({ id, label, icon, earned: have >= need, detail: have >= need ? what : `${what} (${Math.min(have, need)} of ${need})` })

  return {
    finds: counted,
    species: species.size,
    thoroughness: finds.length ? sum / finds.length : 0,
    complete,
    total: finds.length,
    perFind,
    perForay: [...foray].map(([forayId, s]) => ({ forayId, finds: s.finds, species: s.species.size, thoroughness: s.n ? s.sum / s.n : 0 })),
    streak,
    badges: [
      badge('first-complete', 'Complete record', 'mdi-check-decagram', complete, 1, 'A find with every item checked'),
      badge('all-angles', 'Every angle', 'mdi-camera-burst', allShots, 5, 'Five finds with all four shots'),
      badge('spore-printer', 'Spore printer', 'mdi-water-outline', sporePrints, 3, 'Three spore prints'),
      badge('ten-finds', 'Ten finds', 'mdi-mushroom-outline', counted, 10, 'Ten counted finds'),
      badge('ten-species', 'Ten species', 'mdi-format-list-numbered', species.size, 10, 'Ten species among counted finds'),
      badge('streak-3', 'Three-day streak', 'mdi-fire', streak.best, 3, 'Counted finds three days in a row'),
    ],
  }
}

/** "72%" */
export const pct = (t: number) => `${Math.round(t * 100)}%`
