// Logging a foray after the fact: work out its date and place from the photos' metadata.

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
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  return place?.trim() ? `${place.trim()} · ${date}` : `Foray ${date}`
}

/** A short place name from a Nominatim reverse-geocode response (park or wood first, then town). */
export function placeFromNominatim(r: any): string | null {
  const a = r?.address ?? {}
  const pick = a.nature_reserve ?? a.park ?? a.wood ?? a.forest ?? a.leisure ?? a.natural ?? a.protected_area
    ?? a.hamlet ?? a.village ?? a.town ?? a.city ?? a.suburb ?? a.county ?? r?.name
  return typeof pick === 'string' && pick.trim() ? pick.trim() : null
}
