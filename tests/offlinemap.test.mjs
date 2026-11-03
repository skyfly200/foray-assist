// Run: node --experimental-strip-types --test tests/offlinemap.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  areaTiles, cacheKey, coveredBy, fromProtocol, glyphUrls, latToY, lngToX, rewriteStyle, rewriteTileJson, spriteUrls,
  tileKey, toProtocol, pool, MAX_TILES_PER_DOWNLOAD,
} from '../utils/offlineMap.ts'
import { BASE_LAYERS, baseLayer } from '../utils/mapLayers.ts'

test('tile math matches the slippy map scheme', () => {
  // Seattle at z14 is tile 2624/5721
  assert.equal(lngToX(-122.3321, 14), 2624)
  assert.equal(latToY(47.6062, 14), 5721)
  assert.equal(lngToX(180, 3), 7)
  assert.equal(latToY(89, 3), 0)
})

test('one saved area stays well inside OpenFreeMap\'s per-download limit', () => {
  for (const [lat, lng] of [[47.6, -122.3], [0, 0], [64.8, -147.7], [-41.3, 174.8]]) {
    const tiles = areaTiles(lat, lng)
    assert.ok(tiles.length < 600, `${tiles.length} tiles at ${lat},${lng}`)
    assert.ok(tiles.length <= MAX_TILES_PER_DOWNLOAD)
    assert.equal(new Set(tiles.map(tileKey)).size, tiles.length, 'no duplicates')
    assert.ok(tiles.some((t) => t.z === 14))
    assert.equal(tiles.filter((t) => t.z <= 3).length, 1 + 4 + 16 + 64)
  }
})

test('street-level tiles cover about 5 km around the point', () => {
  const z14 = areaTiles(47.6, -122.3).filter((t) => t.z === 14)
  const xs = z14.map((t) => t.x)
  // a z14 tile is ~1.6 km wide at 47.6N, so 10 km across is 6-8 tiles
  assert.ok(Math.max(...xs) - Math.min(...xs) + 1 >= 6)
  assert.ok(Math.max(...xs) - Math.min(...xs) + 1 <= 9)
})

test('an area covers points near its centre only', () => {
  const areas = [{ id: 'a', name: 'x', lat: 47.6, lng: -122.3, savedAt: '', tiles: 1, bytes: 1 }]
  assert.ok(coveredBy(areas, 47.61, -122.31))
  assert.equal(coveredBy(areas, 47.7, -122.3), undefined)
  assert.equal(coveredBy([], 47.6, -122.3), undefined)
})

test('OpenFreeMap URLs go through the caching protocol and back', () => {
  const u = 'https://tiles.openfreemap.org/planet/20261011_080001_pt/14/2625/5722.pbf'
  assert.equal(toProtocol(u), 'fa-tiles://tiles.openfreemap.org/planet/20261011_080001_pt/14/2625/5722.pbf')
  assert.equal(fromProtocol(toProtocol(u)), u)
  assert.equal(toProtocol('https://server.arcgisonline.com/x'), 'https://server.arcgisonline.com/x')
})

test('saved tiles survive an OpenFreeMap rebuild', () => {
  assert.equal(
    cacheKey('fa-tiles://tiles.openfreemap.org/planet/20261011_080001_pt/14/1/2.pbf'),
    cacheKey('https://tiles.openfreemap.org/planet/20261101_010203_pt/14/1/2.pbf'),
  )
  assert.equal(cacheKey('https://tiles.openfreemap.org/styles/liberty'), 'https://tiles.openfreemap.org/styles/liberty')
})

const style = {
  version: 8,
  sources: {
    openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
    ne2_shaded: { type: 'raster', tiles: ['https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png'] },
  },
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sprite: 'https://tiles.openfreemap.org/sprites/ofm_f384/ofm',
  layers: [
    { id: 'a', layout: { 'text-font': ['Noto Sans Regular'] } },
    { id: 'b', layout: { 'text-font': ['Noto Sans Bold'] } },
    { id: 'c', layout: { 'text-font': ['Noto Sans Regular'] } },
    { id: 'd', layout: { 'text-font': ['literal', ['x']] } },
    { id: 'e' },
  ],
}

test('style rewrite touches sources, glyphs and sprite, not the original', () => {
  const s = rewriteStyle(style)
  assert.equal(s.sources.openmaptiles.url, 'fa-tiles://tiles.openfreemap.org/planet')
  assert.equal(s.sources.ne2_shaded.tiles[0], 'fa-tiles://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png')
  assert.ok(s.glyphs.startsWith('fa-tiles://'))
  assert.ok(s.sprite.startsWith('fa-tiles://'))
  assert.equal(style.glyphs.startsWith('https://'), true)
  assert.deepEqual(rewriteTileJson({ tiles: ['https://tiles.openfreemap.org/planet/x_pt/{z}/{x}/{y}.pbf'] }).tiles, ['fa-tiles://tiles.openfreemap.org/planet/x_pt/{z}/{x}/{y}.pbf'])
})

test('fonts and icons for saved areas', () => {
  const g = glyphUrls(style)
  assert.equal(g.length, 6)
  assert.ok(g.includes('https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/0-255.pbf'))
  assert.deepEqual(spriteUrls(style).map((u) => u.split('/').pop()), ['ofm.json', 'ofm.png', 'ofm@2x.json', 'ofm@2x.png'])
})

test('layer list: streets works offline, the rest need internet, unknown ids fall back', () => {
  assert.equal(BASE_LAYERS[0].offline, true)
  assert.ok(BASE_LAYERS.some((l) => l.id === 'satellite' && !l.offline))
  assert.equal(baseLayer('nope').id, 'streets')
  assert.equal(new Set(BASE_LAYERS.map((l) => l.id)).size, BASE_LAYERS.length)
})

test('downloads run at most 4 at a time and count failures', async () => {
  let inFlight = 0
  let max = 0
  let done = 0
  const urls = Array.from({ length: 30 }, (_, i) => `u${i}`)
  const r = await pool(urls, async (u) => {
    inFlight++; max = Math.max(max, inFlight)
    await new Promise((res) => setTimeout(res, 2))
    inFlight--
    if (u === 'u7') throw new Error('x')
    return 10
  }, (n) => { done += n })
  assert.equal(max, 4)
  assert.equal(done, 30)
  assert.deepEqual(r, { bytes: 290, failed: 1 })
})
