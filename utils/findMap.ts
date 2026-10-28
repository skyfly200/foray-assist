// Map page: which finds get a pin, and what each pin says.
// Your own finds come from their specimen row, or from the first photo with GPS when the row has none.
// Other members' finds (peerFinds in shared forays) get a pin too, at the precision their author chose.
export interface MapFind {
  id: string
  forayId: string
  specimenId: string
  timestamp: string
  latitude?: number
  longitude?: number
  fieldNotes?: { speciesGuess?: string }
}

export interface MapPhoto {
  specimenRowId: string
  capturedAt: string
  latitude?: number
  longitude?: number
}

export interface MapPeer {
  id: string
  forayId: string
  authorName: string
  specimenId: string
  timestamp: string
  latitude?: number
  longitude?: number
  geoprivacy: 'open' | 'obscured' | 'private'
  fieldNotes?: { speciesGuess?: string }
}

export interface MapPoint {
  id: string
  specimenId: string
  forayId: string
  forayName: string
  lat: number
  lng: number
  title: string
  at: string
  /** 'mine' for your own find, 'peer' for one from another member of a shared foray. */
  source: 'mine' | 'peer'
  author?: string
}

export interface MapSource {
  finds: MapFind[]
  photos?: MapPhoto[]
  peers?: MapPeer[]
  forayNames: Record<string, string>
  /** Show only this foray. Null or absent shows every foray. */
  forayId?: string | null
}

const valid = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

/** A fix that can go on a map. A 0,0 fix is a failed reading, not a find off Africa. */
export function usableFix(lat: unknown, lng: unknown): lat is number {
  if (!valid(lat) || !valid(lng)) return false
  if (lat === 0 && lng === 0) return false
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180
}

/** Obscured finds show to about 11 km, the same precision PeerFindCard shows them at. */
function peerFix(p: MapPeer): [number, number] | null {
  if (p.geoprivacy === 'private' || !usableFix(p.latitude, p.longitude)) return null
  if (p.geoprivacy === 'obscured') return [Math.round(p.latitude * 10) / 10, Math.round(p.longitude! * 10) / 10]
  return [p.latitude, p.longitude!]
}

/** Pins for every find with a usable GPS fix, newest first. */
export function mapPoints(src: MapSource): MapPoint[] {
  const inForay = (id: string) => !src.forayId || id === src.forayId
  const out: MapPoint[] = []
  const own = new Set(src.finds.map((f) => f.id))

  // The first photo that has GPS, per find, for finds whose own row has none.
  const photoFix = new Map<string, { lat: number; lng: number }>()
  const byTime = [...(src.photos ?? [])].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
  for (const p of byTime) {
    if (photoFix.has(p.specimenRowId) || !usableFix(p.latitude, p.longitude)) continue
    photoFix.set(p.specimenRowId, { lat: p.latitude, lng: p.longitude! })
  }

  for (const f of src.finds) {
    if (!inForay(f.forayId)) continue
    const fix = usableFix(f.latitude, f.longitude) ? { lat: f.latitude!, lng: f.longitude! } : photoFix.get(f.id)
    if (!fix) continue
    out.push({
      id: f.id,
      specimenId: f.specimenId,
      forayId: f.forayId,
      forayName: src.forayNames[f.forayId] ?? 'Foray',
      lat: fix.lat,
      lng: fix.lng,
      title: f.fieldNotes?.speciesGuess?.trim() || 'Unidentified find',
      at: f.timestamp,
      source: 'mine',
    })
  }

  for (const p of src.peers ?? []) {
    // A shared find that came back as our own row is already plotted above.
    if (!inForay(p.forayId) || own.has(p.id)) continue
    const fix = peerFix(p)
    if (!fix) continue
    out.push({
      id: p.id,
      specimenId: p.specimenId,
      forayId: p.forayId,
      forayName: src.forayNames[p.forayId] ?? 'Foray',
      lat: fix[0],
      lng: fix[1],
      title: p.fieldNotes?.speciesGuess?.trim() || 'Unidentified find',
      at: p.timestamp,
      source: 'peer',
      author: p.authorName,
    })
  }

  return out.sort((a, b) => b.at.localeCompare(a.at))
}

/** Finds in view (or in one foray) that have no usable location, for the "without a location" count. */
export function missingFixes(finds: MapFind[], photos: MapPhoto[], forayId?: string | null): number {
  const withPhotoFix = new Set(photos.filter((p) => usableFix(p.latitude, p.longitude)).map((p) => p.specimenRowId))
  return finds.filter((f) => (!forayId || f.forayId === forayId) && !usableFix(f.latitude, f.longitude) && !withPhotoFix.has(f.id)).length
}
