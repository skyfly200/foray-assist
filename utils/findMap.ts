// Map page: which finds get a pin, and what each pin says.
export interface MapFind {
  id: string
  forayId: string
  specimenId: string
  timestamp: string
  latitude?: number
  longitude?: number
  fieldNotes?: { speciesGuess?: string }
}

export interface MapPoint {
  id: string
  forayId: string
  forayName: string
  lat: number
  lng: number
  title: string
  at: string
}

const valid = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

/** Finds with a usable GPS fix, newest first. A 0,0 fix is a failed reading, not a find off Africa. */
export function mapPoints(finds: MapFind[], forayNames: Record<string, string>, forayId?: string | null): MapPoint[] {
  const out: MapPoint[] = []
  for (const f of finds) {
    if (forayId && f.forayId !== forayId) continue
    if (!valid(f.latitude) || !valid(f.longitude)) continue
    if (f.latitude === 0 && f.longitude === 0) continue
    if (Math.abs(f.latitude) > 90 || Math.abs(f.longitude) > 180) continue
    out.push({
      id: f.id,
      forayId: f.forayId,
      forayName: forayNames[f.forayId] ?? 'Foray',
      lat: f.latitude,
      lng: f.longitude,
      title: f.fieldNotes?.speciesGuess?.trim() || 'Unidentified find',
      at: f.timestamp,
    })
  }
  return out.sort((a, b) => b.at.localeCompare(a.at))
}
