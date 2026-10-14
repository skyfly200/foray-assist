// Finds dex: groups every find by its species guess into one entry per taxon, numbered in the
// order you first found them, plus totals for the stats header. Pure, so tests can run it in Node.

export interface DexFind {
  id: string
  forayId: string
  timestamp: string
  latitude?: number
  longitude?: number
  speciesGuess?: string
}

export interface DexSighting {
  findId: string
  forayId: string
  forayName: string
  at: string
  latitude?: number
  longitude?: number
}

export interface DexEntry {
  key: string
  /** 1-based, in order of first sighting. */
  number: number
  name: string
  genus: string
  count: number
  forayCount: number
  first: DexSighting
  last: DexSighting
  /** Every sighting, newest first. */
  sightings: DexSighting[]
}

export interface DexStats {
  species: number
  genera: number
  finds: number
  identified: number
  unidentified: number
  forays: number
  mostFound?: { name: string; count: number }
  newest?: { name: string; at: string }
}

/** Grouping key: case, extra spaces and a trailing "?" don't make a new species. */
export function taxonKey(guess: string | undefined): string {
  return (guess ?? '').trim().replace(/\?+$/, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

export function buildDex(finds: DexFind[], forayNames: Record<string, string> = {}): { entries: DexEntry[]; stats: DexStats } {
  const groups = new Map<string, { names: Map<string, number>; sightings: DexSighting[] }>()
  let unidentified = 0
  for (const f of finds) {
    const key = taxonKey(f.speciesGuess)
    if (!key) {
      unidentified++
      continue
    }
    let g = groups.get(key)
    if (!g) groups.set(key, (g = { names: new Map(), sightings: [] }))
    const name = f.speciesGuess!.trim().replace(/\?+$/, '').replace(/\s+/g, ' ').trim()
    g.names.set(name, (g.names.get(name) ?? 0) + 1)
    g.sightings.push({
      findId: f.id,
      forayId: f.forayId,
      forayName: forayNames[f.forayId] ?? 'Unknown foray',
      at: f.timestamp,
      latitude: f.latitude,
      longitude: f.longitude,
    })
  }

  const entries: DexEntry[] = [...groups.entries()].map(([key, g]) => {
    const sightings = g.sightings.sort((a, b) => b.at.localeCompare(a.at))
    // Show the spelling used most often; ties go to the one that reads most like a binomial.
    const name = [...g.names.entries()].sort((a, b) => b[1] - a[1] || capScore(b[0]) - capScore(a[0]))[0][0]
    return {
      key,
      number: 0,
      name,
      genus: key.split(' ')[0],
      count: sightings.length,
      forayCount: new Set(sightings.map((s) => s.forayId)).size,
      first: sightings[sightings.length - 1],
      last: sightings[0],
      sightings,
    }
  })
  entries.sort((a, b) => a.first.at.localeCompare(b.first.at) || a.key.localeCompare(b.key))
  entries.forEach((e, i) => (e.number = i + 1))

  const mostFound = entries.reduce<DexEntry | undefined>((m, e) => (!m || e.count > m.count ? e : m), undefined)
  const newest = entries[entries.length - 1]
  return {
    entries,
    stats: {
      species: entries.length,
      genera: new Set(entries.map((e) => e.genus)).size,
      finds: finds.length,
      identified: finds.length - unidentified,
      unidentified,
      forays: new Set(finds.map((f) => f.forayId)).size,
      mostFound: mostFound && { name: mostFound.name, count: mostFound.count },
      newest: newest && { name: newest.name, at: newest.first.at },
    },
  }
}

/** "Amanita muscaria" beats "amanita muscaria" and "AMANITA MUSCARIA". */
function capScore(s: string): number {
  return (/^[A-Z][a-z]/.test(s) ? 2 : 0) + (s === s.toUpperCase() ? 0 : 1)
}

/** Dex number as shown on cards, e.g. #007. */
export const dexNo = (n: number) => `#${String(n).padStart(3, '0')}`
