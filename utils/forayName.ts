// Default foray names: "Place · Oct 3, 2026", or "Foray Oct 3, 2026" until a place is known.
import { distanceKm } from './offlineMap.ts'

/** "Oct 3, 2026" for a local YYYY-MM-DD day. */
export function forayDateLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Local YYYY-MM-DD for an ISO time. */
export function dayOf(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function defaultForayName(day: string, place?: string | null): string {
  const date = forayDateLabel(day)
  return place?.trim() ? `${place.trim()} · ${date}` : `Foray ${date}`
}

/**
 * True when the name is still the date-only default (today's format, or the older "Foray 10/3/2026"),
 * so a place can be added without overwriting a title the user chose.
 */
export function isDateOnlyName(name: string, startedAt: string): boolean {
  const n = name.trim()
  return n === defaultForayName(dayOf(startedAt)) || n === `Foray ${new Date(startedAt).toLocaleDateString()}`
}

export interface CachedPlace {
  latitude: number
  longitude: number
  name: string
}

/** Nearest place looked up before, if one is within maxKm; lets a foray at a familiar spot be named offline. */
export function nearestCachedPlace(cache: CachedPlace[], at: { latitude: number; longitude: number }, maxKm = 2): string | null {
  let best: CachedPlace | null = null
  let bestKm = maxKm
  for (const p of cache) {
    const km = distanceKm(p.latitude, p.longitude, at.latitude, at.longitude)
    if (km <= bestKm) {
      best = p
      bestKm = km
    }
  }
  return best?.name ?? null
}

/** Middle of a set of points (median per axis, so one stray fix doesn't drag it), or null if none. */
export function medianPoint(points: { latitude?: number; longitude?: number }[]): { latitude: number; longitude: number } | null {
  const geo = points.filter((p) => typeof p.latitude === 'number' && typeof p.longitude === 'number')
  if (!geo.length) return null
  const mid = (xs: number[]) => {
    const a = [...xs].sort((x, y) => x - y)
    const m = a.length >> 1
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
  }
  return { latitude: mid(geo.map((g) => g.latitude!)), longitude: mid(geo.map((g) => g.longitude!)) }
}
