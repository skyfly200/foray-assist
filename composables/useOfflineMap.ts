// Offline base map. Every OpenFreeMap file (style, tiles, fonts, icons) goes through one MapLibre
// protocol handler that answers from Cache Storage first, so the map draws without signal:
//  - 'map-offline' holds saved areas (around you, or a view you chose) and is only changed here;
//  - 'map-viewed' keeps what you have looked at, trimmed to the newest few thousand files.
// Saved areas are listed in Dexie settings key 'offlineMapAreas'.
import type { AddProtocolAction } from 'maplibre-gl'
import {
  OFM_STYLE, PROTOCOL, areaTiles, cacheKey, coveredBy, fillTemplate, fromProtocol, glyphUrls,
  pool, rewriteStyle, rewriteTileJson, spriteUrls, tileKey, type OfflineArea,
} from '~/utils/offlineMap'

const SAVED = 'map-offline'
const VIEWED = 'map-viewed'
const VIEWED_MAX = 3000
const AREAS_KEY = 'offlineMapAreas'
/** Areas saved automatically around you; the oldest goes when a new one is saved. */
const MAX_AUTO_AREAS = 3

/** The style and TileJSON have no file extension; tiles, fonts and icons do. */
const isDoc = (url: string) => !/\.[a-z0-9]+$/i.test(new URL(url).pathname)

async function fromCache(key: string): Promise<Response | undefined> {
  if (typeof caches === 'undefined') return undefined
  return (await (await caches.open(SAVED)).match(key)) ?? (await (await caches.open(VIEWED)).match(key))
}

let viewedPuts = 0
async function keepViewed(key: string, res: Response) {
  try {
    const c = await caches.open(VIEWED)
    await c.put(key, res)
    if (++viewedPuts % 200 === 0) {
      // keys() is in insertion order, so the front of the list is the oldest.
      const keys = await c.keys()
      for (const k of keys.slice(0, Math.max(0, keys.length - VIEWED_MAX))) await c.delete(k)
    }
  } catch { /* quota or private mode: the map still works online */ }
}

/** Style and TileJSON: network first so OpenFreeMap updates come through, cache when offline. */
async function loadDoc(url: string, signal: AbortSignal): Promise<Response> {
  const key = cacheKey(url)
  if (navigator.onLine) {
    try {
      const res = await fetch(url, { signal })
      if (res.ok) {
        const c = await caches.open(VIEWED).catch(() => null)
        await c?.put(key, res.clone()).catch(() => {})
        return res
      }
    } catch (e) {
      if (signal.aborted) throw e
    }
  }
  const hit = await fromCache(key)
  if (hit) return hit
  throw new Error(`Map file not saved for offline use: ${url}`)
}

/** Tiles, fonts and icons: cache first. */
async function loadFile(url: string, signal: AbortSignal): Promise<Response> {
  const key = cacheKey(url)
  const hit = await fromCache(key)
  if (hit) return hit
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Map file ${res.status}: ${url}`)
  void keepViewed(key, res.clone())
  return res
}

const handler: AddProtocolAction = async (params, abort) => {
  const url = fromProtocol(params.url)
  const res = isDoc(url) ? await loadDoc(url, abort.signal) : await loadFile(url, abort.signal)
  if (params.type === 'json') {
    const body = await res.json()
    // A TileJSON names the tile template; send those through this handler too.
    return { data: Array.isArray(body?.tiles) ? rewriteTileJson(body) : body }
  }
  if (params.type === 'string') return { data: await res.text() }
  return { data: await res.arrayBuffer() }
}

let registered = false
/** Registers the caching protocol with MapLibre and returns the base style ready to draw. */
export async function prepareBaseStyle(maplibre: typeof import('maplibre-gl')) {
  if (!registered) {
    maplibre.addProtocol(PROTOCOL, handler)
    registered = true
  }
  const ctl = new AbortController()
  const style = await (await loadDoc(OFM_STYLE, ctl.signal)).json()
  return rewriteStyle(style)
}

async function fetchInto(cache: Cache, url: string): Promise<number> {
  const key = cacheKey(url)
  const have = await cache.match(key)
  if (have) return Number(have.headers.get('content-length')) || 0
  const res = await fetch(url)
  if (!res.ok) {
    if (res.status === 404 || res.status === 204) return 0 // open ocean and other empty tiles
    throw new Error(`HTTP ${res.status}`)
  }
  const buf = await res.arrayBuffer()
  await cache.put(key, new Response(buf, { headers: { 'content-type': res.headers.get('content-type') ?? 'application/octet-stream', 'content-length': String(buf.byteLength) } }))
  return buf.byteLength
}

export function useOfflineMap() {
  const areas = useState<OfflineArea[]>('offline-map-areas', () => [])
  const loaded = useState('offline-map-loaded', () => false)
  const saving = useState<{ name: string; done: number; total: number } | null>('offline-map-saving', () => null)
  const error = useState('offline-map-error', () => '')

  async function load() {
    if (loaded.value) return
    try {
      const v = (await useDb().settings.get(AREAS_KEY))?.value
      areas.value = Array.isArray(v) ? (v as OfflineArea[]) : []
    } catch { areas.value = [] }
    loaded.value = true
  }

  async function persist() {
    try { await useDb().settings.put({ key: AREAS_KEY, value: JSON.parse(JSON.stringify(areas.value)) }) } catch { /* in-memory still right */ }
  }

  /** Downloads the base map around a point: world overview, region, and streets nearby. */
  async function saveArea(lat: number, lng: number, name: string, auto = false): Promise<OfflineArea | null> {
    await load()
    if (saving.value || typeof caches === 'undefined') return null
    if (!navigator.onLine) { error.value = 'Saving a map area needs internet.'; return null }
    error.value = ''
    try {
      const ctl = new AbortController()
      const style = await (await loadDoc(OFM_STYLE, ctl.signal)).json()
      const srcUrl = Object.values<any>(style.sources ?? {}).find((s) => s.type === 'vector' && typeof s.url === 'string')?.url as string | undefined
      if (!srcUrl) throw new Error('style has no vector source')
      const tileJson = await (await loadDoc(srcUrl, ctl.signal)).json()
      const template = tileJson.tiles?.[0] as string | undefined
      if (!template) throw new Error('no tile template')
      const tiles = areaTiles(lat, lng)
      const urls = [OFM_STYLE, srcUrl, ...spriteUrls(style), ...glyphUrls(style), ...tiles.map((t) => fillTemplate(template, t))]
      saving.value = { name, done: 0, total: urls.length }
      const cache = await caches.open(SAVED)
      const { bytes, failed } = await pool(urls, (u) => fetchInto(cache, u), (n) => { if (saving.value) saving.value.done += n })
      if (failed > urls.length / 4) throw new Error(`${failed} of ${urls.length} files failed`)
      const area: OfflineArea = { id: crypto.randomUUID(), name, lat, lng, savedAt: new Date().toISOString(), tiles: tiles.length, bytes, auto }
      let next = [area, ...areas.value]
      if (auto) {
        const autos = next.filter((a) => a.auto)
        for (const old of autos.slice(MAX_AUTO_AREAS)) next = await dropTiles(next, old)
      }
      areas.value = next
      await persist()
      try { await navigator.storage?.persist?.() } catch { /* best effort */ }
      return area
    } catch (e) {
      console.warn('saving offline map failed', e)
      error.value = "Couldn't save this map area. Check your connection and try again."
      return null
    } finally {
      saving.value = null
    }
  }

  /** Removes an area from the list, and its tiles from the cache unless another area still uses them. */
  async function dropTiles(list: OfflineArea[], area: OfflineArea): Promise<OfflineArea[]> {
    const rest = list.filter((a) => a.id !== area.id)
    try {
      const keep = new Set(rest.flatMap((a) => areaTiles(a.lat, a.lng).map(tileKey)))
      const cache = await caches.open(SAVED)
      for (const req of await cache.keys()) {
        const m = /\/planet\/current\/(\d+\/\d+\/\d+)\.pbf$/.exec(req.url)
        if (m && !keep.has(m[1]!)) await cache.delete(req)
        else if (!m && !rest.length) await cache.delete(req) // last area gone: style, fonts and icons too
      }
    } catch { /* cache unavailable */ }
    return rest
  }

  async function removeArea(id: string) {
    const area = areas.value.find((a) => a.id === id)
    if (!area) return
    areas.value = await dropTiles(areas.value, area)
    await persist()
  }

  /** Saves the area around you if no saved area covers it yet. Quietly does nothing offline. */
  async function ensureAround(lat: number, lng: number) {
    await load()
    if (!navigator.onLine || saving.value || coveredBy(areas.value, lat, lng)) return
    await saveArea(lat, lng, 'Around you', true)
  }

  return { areas, saving, error, load, saveArea, removeArea, ensureAround }
}
