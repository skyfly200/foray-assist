// Offline base map: which vector tiles to save around a point, and how map URLs map to cache keys.
// Tiles come from OpenFreeMap, whose terms allow offline downloads of up to 3,000 tiles or 50 MB per
// download with at most 4 parallel requests (openfreemap.org/tos). OpenStreetMap's own tile servers
// forbid downloading ahead, which is why the base map is not tile.openstreetmap.org any more.

export const OFM_HOST = 'tiles.openfreemap.org'
export const OFM_STYLE = `https://${OFM_HOST}/styles/liberty`
/** MapLibre protocol the page serves map files through, so saved ones load from Cache Storage. */
export const PROTOCOL = 'fa-tiles'
export const MAX_TILES_PER_DOWNLOAD = 3000
export const MAX_PARALLEL = 4
/** Vector tiles stop at z14; MapLibre draws them sharply at any closer zoom. */
export const MAX_TILE_ZOOM = 14

export interface Tile { z: number; x: number; y: number }
export interface ZoomRing { z: number; radiusKm: number }

/** What one saved area holds: the whole world very zoomed out, then tighter rings down to street level. */
export const AREA_PLAN: ZoomRing[] = [
  { z: 6, radiusKm: 200 },
  { z: 8, radiusKm: 80 },
  { z: 10, radiusKm: 40 },
  { z: 12, radiusKm: 15 },
  { z: 13, radiusKm: 8 },
  { z: 14, radiusKm: 5 },
]
export const WORLD_ZOOMS = [0, 1, 2, 3]

const R_KM = 6371

export function lngToX(lng: number, z: number): number {
  const n = 2 ** z
  return Math.min(n - 1, Math.max(0, Math.floor(((lng + 180) / 360) * n)))
}

export function latToY(lat: number, z: number): number {
  const n = 2 ** z
  const clamped = Math.max(-85.0511, Math.min(85.0511, lat))
  const r = (clamped * Math.PI) / 180
  return Math.min(n - 1, Math.max(0, Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)))
}

/** Every tile at zoom z within radiusKm of a point (a box, not a circle: simpler and only a few tiles more). */
export function tilesInRing(lat: number, lng: number, ring: ZoomRing): Tile[] {
  const dLat = (ring.radiusKm / R_KM) * (180 / Math.PI)
  const dLng = dLat / Math.max(0.01, Math.cos((lat * Math.PI) / 180))
  const x0 = lngToX(Math.max(-180, lng - dLng), ring.z)
  const x1 = lngToX(Math.min(179.9999, lng + dLng), ring.z)
  const y0 = latToY(lat + dLat, ring.z)
  const y1 = latToY(lat - dLat, ring.z)
  const out: Tile[] = []
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push({ z: ring.z, x, y })
  return out
}

/** Tiles for one saved area around a point, world overview first. Never more than the per-download limit. */
export function areaTiles(lat: number, lng: number, plan: ZoomRing[] = AREA_PLAN, world: number[] = WORLD_ZOOMS): Tile[] {
  const out: Tile[] = []
  for (const z of world) {
    const n = 2 ** z
    for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) out.push({ z, x, y })
  }
  for (const ring of plan) out.push(...tilesInRing(lat, lng, ring))
  return out.slice(0, MAX_TILES_PER_DOWNLOAD)
}

export const tileKey = (t: Tile) => `${t.z}/${t.x}/${t.y}`

/** Great-circle distance in km. */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toR = Math.PI / 180
  const dLat = (bLat - aLat) * toR
  const dLng = (bLng - aLng) * toR
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * toR) * Math.cos(bLat * toR) * Math.sin(dLng / 2) ** 2
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

export interface OfflineArea {
  id: string
  name: string
  lat: number
  lng: number
  savedAt: string
  tiles: number
  bytes: number
  /** Saved without being asked, around where you were. These are the ones dropped first. */
  auto?: boolean
}

/** A saved area already has street-level detail here (inside its z14 ring, with a little margin). */
export function coveredBy(areas: OfflineArea[], lat: number, lng: number, plan: ZoomRing[] = AREA_PLAN): OfflineArea | undefined {
  const inner = Math.min(...plan.map((r) => r.radiusKm))
  return areas.find((a) => distanceKm(a.lat, a.lng, lat, lng) <= inner * 0.6)
}

/** https://host/path -> fa-tiles://host/path, for map files that should go through the cache. */
export function toProtocol(url: string): string {
  return url.startsWith(`https://${OFM_HOST}/`) ? `${PROTOCOL}://${url.slice('https://'.length)}` : url
}

export function fromProtocol(url: string): string {
  return url.startsWith(`${PROTOCOL}://`) ? `https://${url.slice(PROTOCOL.length + 3)}` : url
}

/**
 * The cache key for a map file. Tile URLs carry a dated build id (planet/20261011_080001_pt/14/1/2.pbf)
 * that changes every few weeks; dropping it keeps saved tiles usable after OpenFreeMap rebuilds.
 */
export function cacheKey(url: string): string {
  return fromProtocol(url).replace(/\/planet\/[^/]+_pt\//, '/planet/current/')
}

/** Points every OpenFreeMap URL in a style (sources, glyphs, sprite) at the caching protocol. */
export function rewriteStyle<S extends Record<string, any>>(style: S): S {
  const s = structuredClone(style) as Record<string, any>
  for (const src of Object.values<Record<string, any>>(s.sources ?? {})) {
    if (typeof src.url === 'string') src.url = toProtocol(src.url)
    if (Array.isArray(src.tiles)) src.tiles = src.tiles.map(toProtocol)
  }
  if (typeof s.glyphs === 'string') s.glyphs = toProtocol(s.glyphs)
  if (typeof s.sprite === 'string') s.sprite = toProtocol(s.sprite)
  else if (Array.isArray(s.sprite)) s.sprite = s.sprite.map((sp: { id: string; url: string }) => ({ ...sp, url: toProtocol(sp.url) }))
  return s as S
}

/** Same for a TileJSON: its tile template goes through the caching protocol. */
export function rewriteTileJson<T extends { tiles?: string[] }>(tj: T): T {
  return { ...tj, tiles: (tj.tiles ?? []).map(toProtocol) }
}

/** Font stacks the style's labels use, so their glyphs can be saved too. */
export function fontStacks(style: { layers?: Array<{ layout?: Record<string, unknown> }> }): string[] {
  const out = new Set<string>()
  for (const l of style.layers ?? []) {
    const f = l.layout?.['text-font']
    if (Array.isArray(f) && f.every((x) => typeof x === 'string')) out.add(f.join(','))
  }
  return [...out]
}

/** Glyph files for labels in Latin script: basic letters, then accented ones. */
export function glyphUrls(style: { glyphs?: string; layers?: Array<{ layout?: Record<string, unknown> }> }): string[] {
  if (!style.glyphs) return []
  const out: string[] = []
  for (const stack of fontStacks(style)) {
    for (const range of ['0-255', '256-511', '8192-8447']) {
      out.push(style.glyphs.replace('{fontstack}', encodeURIComponent(stack)).replace('{range}', range))
    }
  }
  return out
}

/** Sprite sheet files (JSON and image, normal and high density). */
export function spriteUrls(style: { sprite?: string | Array<{ url: string }> }): string[] {
  const bases = typeof style.sprite === 'string' ? [style.sprite] : (style.sprite ?? []).map((s) => s.url)
  return bases.flatMap((b) => [`${b}.json`, `${b}.png`, `${b}@2x.json`, `${b}@2x.png`])
}

export function fillTemplate(template: string, t: Tile): string {
  return template.replace('{z}', String(t.z)).replace('{x}', String(t.x)).replace('{y}', String(t.y))
}

/** Runs a job per URL, at most `limit` at a time (OpenFreeMap allows 4 for offline downloads). */
export async function pool(urls: string[], run: (u: string) => Promise<number>, onDone: (n: number) => void, limit = MAX_PARALLEL): Promise<{ bytes: number; failed: number }> {
  let next = 0
  let bytes = 0
  let failed = 0
  const worker = async () => {
    while (next < urls.length) {
      const u = urls[next++]!
      try {
        const n = await run(u) // not `bytes += await`: that reads bytes before the await and loses updates
        bytes += n
      } catch { failed++ }
      onDone(1)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, urls.length) }, worker))
  return { bytes, failed }
}

/** Rough size for a friendly label. */
export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
