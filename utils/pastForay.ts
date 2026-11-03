// Logging a foray after the fact: work out its date and place from the photos' metadata.
import { defaultForayName } from './forayName.ts'

export interface PhotoStamp {
  capturedAt: string // ISO
  timeSource: 'exif' | 'file'
  latitude?: number
  longitude?: number
}

export interface PastForaySummary {
  /** earliest photo time, ISO */
  startedAt: string
  /** latest photo time, ISO */
  endedAt: string
  /** local calendar day of startedAt, YYYY-MM-DD (for a date input) */
  day: string
  /** true when at least one photo had a real camera timestamp */
  fromExif: boolean
  /** middle of the geotagged photos, if any had GPS */
  center?: { latitude: number; longitude: number }
  gpsCount: number
}

/** Local YYYY-MM-DD for a Date (what <input type="date"> uses). */
export function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * Date range + centre point from photo metadata. Camera (EXIF) times win over file times when
 * any photo has one, since file times change when a photo is copied or downloaded.
 */
export function summarizePhotos(stamps: PhotoStamp[]): PastForaySummary | null {
  const valid = stamps.filter((s) => Number.isFinite(Date.parse(s.capturedAt)))
  if (!valid.length) return null
  const exif = valid.filter((s) => s.timeSource === 'exif')
  const timed = exif.length ? exif : valid
  const times = timed.map((s) => Date.parse(s.capturedAt)).sort((a, b) => a - b)
  const geo = valid.filter((s) => typeof s.latitude === 'number' && typeof s.longitude === 'number')
  let center: PastForaySummary['center']
  if (geo.length) {
    // Median, not mean: one stray photo (taken at home, or a bad fix) shouldn't drag the point away.
    const mid = (xs: number[]) => {
      const a = [...xs].sort((x, y) => x - y)
      const m = a.length >> 1
      return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
    }
    center = { latitude: mid(geo.map((g) => g.latitude!)), longitude: mid(geo.map((g) => g.longitude!)) }
  }
  const start = new Date(times[0])
  return {
    startedAt: start.toISOString(),
    endedAt: new Date(times[times.length - 1]).toISOString(),
    day: localDay(start),
    fromExif: exif.length > 0,
    center,
    gpsCount: geo.length,
  }
}

/**
 * Start/end for a foray on a chosen day. When the photos fall on that day their times are used;
 * otherwise (no photos, or the user changed the date) the foray spans that local day, ending at the
 * day's end, or now if the day is today.
 */
export function pastForayTimes(day: string, summary: PastForaySummary | null, now = new Date()): { startedAt: string; endedAt: string } {
  if (summary && summary.day === day) return { startedAt: summary.startedAt, endedAt: summary.endedAt }
  const [y, m, d] = day.split('-').map(Number)
  const start = new Date(y, m - 1, d, 9, 0, 0)
  const end = new Date(y, m - 1, d, 23, 59, 0)
  return {
    startedAt: start.toISOString(),
    endedAt: (end > now ? (now > start ? now : start) : end).toISOString(),
  }
}

/** Default name: "Place · Oct 3, 2026", or "Foray Oct 3, 2026" without a place. */
export function pastForayName(day: string, place?: string | null): string {
  return defaultForayName(day, place)
}

/** A short place name from a Nominatim reverse-geocode response (park or wood first, then town). */
export function placeFromNominatim(r: any): string | null {
  const a = r?.address ?? {}
  const pick = a.nature_reserve ?? a.park ?? a.wood ?? a.forest ?? a.leisure ?? a.natural ?? a.protected_area
    ?? a.hamlet ?? a.village ?? a.town ?? a.city ?? a.suburb ?? a.county ?? r?.name
  return typeof pick === 'string' && pick.trim() ? pick.trim() : null
}

/** Time and place for a find or photo, taken from photo metadata. */
export interface FindStamp {
  timestamp: string
  latitude?: number
  longitude?: number
  /** the photo was taken just now, so the device's current position is a fair stand-in for missing GPS */
  useDevicePosition: boolean
}

/** A photo counts as "just taken" within this window; older ones never borrow the device's position. */
export const FRESH_PHOTO_MS = 30 * 60_000

export function photoStamp(m: PhotoStamp, now = Date.now()): FindStamp {
  const t = Date.parse(m.capturedAt)
  // File times count too: a gallery file last modified weeks ago is an old photo, EXIF or not.
  const fresh = !Number.isFinite(t) || now - t < FRESH_PHOTO_MS
  return {
    timestamp: m.capturedAt,
    ...(typeof m.latitude === 'number' && typeof m.longitude === 'number' ? { latitude: m.latitude, longitude: m.longitude } : {}),
    useDevicePosition: fresh,
  }
}

/** One stamp for a find made of several photos: the earliest camera time and the middle GPS point. */
export function findStamp(metas: PhotoStamp[], now = Date.now()): FindStamp | null {
  const s = summarizePhotos(metas)
  if (!s) return null
  const fresh = now - Date.parse(s.endedAt) < FRESH_PHOTO_MS
  return {
    timestamp: fresh ? new Date(now).toISOString() : s.startedAt,
    ...(s.center ?? {}),
    useDevicePosition: fresh,
  }
}
