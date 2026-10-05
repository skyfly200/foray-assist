// Series clustering (SPEC §3.1): group photos into one find when each photo is
// within `maxSeconds` of the previous one AND (either side lacks GPS OR the
// photo is within `maxMeters` of the cluster's GPS centroid).
// Pure, dependency-free, deterministic.

export interface ClusterInput {
  id: string
  /** ISO timestamp */
  capturedAt: string
  latitude?: number
  longitude?: number
}

export interface ClusterOptions {
  maxSeconds?: number
  maxMeters?: number
}

export const DEFAULT_MAX_SECONDS = 120
export const DEFAULT_MAX_METERS = 5

const hasGps = (p: { latitude?: number; longitude?: number }) =>
  typeof p.latitude === 'number' && typeof p.longitude === 'number' && Number.isFinite(p.latitude) && Number.isFinite(p.longitude)

/** Great-circle distance in meters. */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371008.8
  const rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad
  const dLon = (lon2 - lon1) * rad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** True if two (time, position) points belong to the same find. Missing GPS on either side passes the distance test. */
export function withinWindow(
  a: { t: number; latitude?: number; longitude?: number },
  b: { t: number; latitude?: number; longitude?: number },
  maxSeconds = DEFAULT_MAX_SECONDS,
  maxMeters = DEFAULT_MAX_METERS,
): boolean {
  if (!Number.isFinite(a.t) || !Number.isFinite(b.t)) return false
  if (Math.abs(a.t - b.t) > maxSeconds * 1000) return false
  if (hasGps(a) && hasGps(b)) return haversineMeters(a.latitude!, a.longitude!, b.latitude!, b.longitude!) <= maxMeters
  return true
}

/** Returns groups of photo ids, groups ordered by first photo time, ids ordered by time (ties by id). */
export function clusterPhotos(photos: ClusterInput[], opts: ClusterOptions = {}): string[][] {
  const maxSeconds = opts.maxSeconds ?? DEFAULT_MAX_SECONDS
  const maxMeters = opts.maxMeters ?? DEFAULT_MAX_METERS
  const items = photos.map((p) => ({ p, t: Date.parse(p.capturedAt) }))
  // Unparseable times sort last and never merge.
  items.sort((x, y) => {
    const xn = Number.isNaN(x.t)
    const yn = Number.isNaN(y.t)
    if (xn !== yn) return xn ? 1 : -1
    if (x.t !== y.t) return x.t - y.t
    return x.p.id < y.p.id ? -1 : x.p.id > y.p.id ? 1 : 0
  })

  const groups: string[][] = []
  let ids: string[] = []
  let prevT = NaN
  let sumLat = 0
  let sumLon = 0
  let nGps = 0

  const flush = () => {
    if (ids.length) groups.push(ids)
    ids = []
    sumLat = sumLon = 0
    nGps = 0
  }

  for (const { p, t } of items) {
    if (ids.length) {
      const centroid = nGps ? { latitude: sumLat / nGps, longitude: sumLon / nGps } : {}
      const join = withinWindow({ t: prevT }, { t }, maxSeconds, Infinity) &&
        withinWindow({ t, ...centroid }, { t, latitude: p.latitude, longitude: p.longitude }, Infinity, maxMeters)
      if (!join) flush()
    }
    ids.push(p.id)
    prevT = t
    if (hasGps(p)) {
      sumLat += p.latitude!
      sumLon += p.longitude!
      nGps++
    }
  }
  flush()
  return groups
}
