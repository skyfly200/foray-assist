// Adds a place to date-only foray names ("Foray Oct 3, 2026" -> "Mount Falcon Park · Oct 3, 2026").
// The place comes from the foray's finds (or the device, for a foray just started), named by an
// OpenStreetMap reverse lookup. Offline, a place looked up before within 2 km is reused; otherwise the
// name stays date-only and is filled in once the app is back online. Titles the user typed are never touched.
import { getPositionBestEffort } from '~/composables/useFinds'
import { canEditForay, renameForay } from '~/composables/useNewFind'
import { dayOf, defaultForayName, isDateOnlyName, medianPoint, nearestCachedPlace, type CachedPlace } from '~/utils/forayName'
import { placeFromNominatim } from '~/utils/pastForay'

const CACHE_KEY = 'fa-place-cache'
const CACHE_MAX = 200
/** A foray started this recently is assumed to be where the phone is now. */
const LIVE_MS = 12 * 3600_000

function readCache(): CachedPlace[] {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function remember(p: CachedPlace) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify([p, ...readCache()].slice(0, CACHE_MAX)))
  } catch {
    /* storage full or blocked: lookups just repeat */
  }
}

// Spots already looked up this session with no result, so a failing lookup isn't repeated every tick.
const missed = new Set<string>()
// Nominatim asks for at most one request a second; lookups queue behind each other.
let queue: Promise<unknown> = Promise.resolve()

async function lookUp(at: { latitude: number; longitude: number }): Promise<string | null> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 6000)
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&lat=${at.latitude.toFixed(5)}&lon=${at.longitude.toFixed(5)}`
    const res = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } })
    return res.ok ? placeFromNominatim(await res.json()) : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
    await new Promise((r) => setTimeout(r, 1100))
  }
}

/** Place name near a point: from the cache, else (online) from OpenStreetMap. Null when unknown. */
export async function placeNear(at: { latitude: number; longitude: number }): Promise<string | null> {
  const cached = nearestCachedPlace(readCache(), at)
  if (cached) return cached
  const key = `${at.latitude.toFixed(3)},${at.longitude.toFixed(3)}`
  if (missed.has(key) || (typeof navigator !== 'undefined' && navigator.onLine === false)) return null
  const job = queue.then(() => lookUp(at))
  queue = job.catch(() => null)
  const name = await job
  if (name) remember({ ...at, name })
  else missed.add(key)
  return name
}

/**
 * Names a date-only foray after its place, if one can be found. True when the name changed.
 * `useDevice` lets a foray just started borrow the phone's position before any find has GPS; the
 * background pass leaves it off so it never asks for location on its own.
 */
export async function addPlaceToForayName(forayId: string, useDevice = false): Promise<boolean> {
  const db = useDb()
  const f = await db.forays.get(forayId)
  if (!f || !canEditForay(f) || !isDateOnlyName(f.name, f.startedAt)) return false
  const [finds, photos] = await Promise.all([
    db.specimens.where('forayId').equals(forayId).toArray(),
    db.photos.where('forayId').equals(forayId).toArray(),
  ])
  let at = medianPoint(finds) ?? medianPoint(photos)
  if (!at && useDevice && !f.endedAt && Date.now() - Date.parse(f.startedAt) < LIVE_MS) at = await getPositionBestEffort()
  if (!at) return false
  const place = await placeNear(at)
  if (!place) return false
  // Re-check: the user may have typed a title while the lookup ran.
  const cur = await db.forays.get(forayId)
  if (!cur || !isDateOnlyName(cur.name, cur.startedAt)) return false
  await renameForay(forayId, defaultForayName(dayOf(cur.startedAt), place))
  return true
}

let running = false
/** Tries every date-only foray this device owns, one at a time. */
export async function fillForayPlaces() {
  if (running) return
  running = true
  try {
    const forays = await useDb().forays.toArray()
    for (const f of forays) {
      if (canEditForay(f) && isDateOnlyName(f.name, f.startedAt)) await addPlaceToForayName(f.id).catch(() => false)
    }
  } finally {
    running = false
  }
}
