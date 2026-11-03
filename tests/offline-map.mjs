// Offline base map against the PRODUCTION build, with OpenFreeMap and Esri mocked.
// Usage: npm run build && node tests/offline-map.mjs
// Checks: the area around you saves on its own (the 4-at-a-time limit is unit-tested), the map draws from
// the saved area with no network, satellite is greyed out offline, the layer choice sticks, and
// removing the area empties the cache.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
// MapLibre's own encoders (installed with maplibre-gl) build real vector tiles for the mock.
import { GeoJSONVT } from '@maplibre/geojson-vt'
import { fromGeojsonVt } from '../node_modules/@maplibre/vt-pbf/dist/index.es.js'
import { PNG } from 'pngjs'

const PORT = 4175
const URL = `http://localhost:${PORT}`
const server = spawn('node', ['.output/server/index.mjs'], { stdio: 'ignore', env: { ...process.env, PORT: String(PORT), NITRO_PORT: String(PORT) } })
let browser
const fail = async (msg) => { console.error('FAIL:', msg); await browser?.close(); server.kill(); process.exit(1) }

// One polygon over the whole world in a "water" layer, so any loaded tile paints magenta.
const world = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]] } }] }
const index = new GeoJSONVT(world, { maxZoom: 14, indexMaxZoom: 0, buffer: 64 })
const tile = (z, x, y) => {
  const t = index.getTile(z, x, y)
  return Buffer.from(fromGeojsonVt({ water: t ?? { features: [] } }, { version: 2 }))
}
const png = (r, g, b) => {
  const p = new PNG({ width: 256, height: 256 })
  for (let i = 0; i < p.data.length; i += 4) { p.data[i] = r; p.data[i + 1] = g; p.data[i + 2] = b; p.data[i + 3] = 255 }
  return PNG.sync.write(p)
}
const style = {
  version: 8,
  sources: { openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' } },
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sprite: 'https://tiles.openfreemap.org/sprites/ofm_f384/ofm',
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#ffffff' } },
    { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water', paint: { 'fill-color': '#ff00ff' } },
    { id: 'label', type: 'symbol', source: 'openmaptiles', 'source-layer': 'water', layout: { 'text-field': 'x', 'text-font': ['Noto Sans Regular'] } },
  ],
}

let ofmBlocked = false
let inFlight = 0
let maxInFlight = 0
let tileRequests = 0

await new Promise((r) => setTimeout(r, 4000))
browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
const context = await browser.newContext({ permissions: ['geolocation'], geolocation: { latitude: 47.5, longitude: -121.8 }, viewport: { width: 420, height: 800 } })
await context.route('https://tiles.openfreemap.org/**', async (route) => {
  if (ofmBlocked) return route.abort('internetdisconnected')
  const u = new globalThis.URL(route.request().url())
  inFlight++
  maxInFlight = Math.max(maxInFlight, inFlight)
  await new Promise((r) => setTimeout(r, 15))
  inFlight--
  const cors = { 'access-control-allow-origin': '*' }
  if (u.pathname === '/styles/liberty') return route.fulfill({ json: style, headers: cors })
  if (u.pathname === '/planet') return route.fulfill({ json: { tilejson: '3.0.0', minzoom: 0, maxzoom: 14, tiles: ['https://tiles.openfreemap.org/planet/20261011_080001_pt/{z}/{x}/{y}.pbf'] }, headers: cors })
  const m = /\/planet\/[^/]+\/(\d+)\/(\d+)\/(\d+)\.pbf$/.exec(u.pathname)
  if (m) { tileRequests++; return route.fulfill({ body: tile(+m[1], +m[2], +m[3]), headers: { ...cors, 'content-type': 'application/x-protobuf' } }) }
  if (u.pathname.startsWith('/fonts/')) return route.fulfill({ body: Buffer.alloc(0), headers: cors })
  if (u.pathname.endsWith('.json')) return route.fulfill({ json: {}, headers: cors })
  if (u.pathname.endsWith('.png')) return route.fulfill({ body: png(0, 0, 0), headers: { ...cors, 'content-type': 'image/png' } })
  return route.fulfill({ status: 404, headers: cors })
})
await context.route('https://server.arcgisonline.com/**', (route) => route.fulfill({ body: png(0, 200, 0), headers: { 'content-type': 'image/png', 'access-control-allow-origin': '*' } }))

const page = await context.newPage()
page.on('pageerror', (e) => console.error('pageerror:', e.message))
const centrePixel = async () => {
  const shot = PNG.sync.read(await page.locator('.fa-map__canvas').screenshot())
  const i = (Math.floor(shot.height / 2) * shot.width + Math.floor(shot.width / 2) + 40) * 4
  return [shot.data[i], shot.data[i + 1], shot.data[i + 2]]
}
const isMagenta = ([r, g, b]) => r > 200 && g < 80 && b > 200
const areas = () => page.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('forray-assist')
  r.onsuccess = () => { const q = r.result.transaction('settings').objectStore('settings').get('offlineMapAreas'); q.onsuccess = () => res(q.result?.value ?? []) }
}))
const savedFiles = () => page.evaluate(async () => (await (await caches.open('map-offline')).keys()).length)

await page.goto(`${URL}/map`)
await page.evaluate(() => navigator.serviceWorker.ready)
// The area around you saves without asking, since location is already allowed.
let saved = []
for (let i = 0; i < 60 && !saved.length; i++) { await page.waitForTimeout(500); saved = await areas() }
if (saved.length !== 1) await fail('area around you was not saved: ' + JSON.stringify(saved))
const a = saved[0]
console.log(`saved "${a.name}": ${a.tiles} tiles, ${a.bytes} bytes, ${await savedFiles()} files; max parallel incl. map drawing ${maxInFlight}`)
if (!a.auto || Math.abs(a.lat - 47.5) > 0.01) await fail('saved area has the wrong centre or flag')
if (a.tiles < 100 || a.tiles > 3000) await fail('unexpected tile count ' + a.tiles)
await page.waitForTimeout(1500)
if (!isMagenta(await centrePixel())) await fail('base map did not draw online: ' + (await centrePixel()))

// Offline: no OpenFreeMap at all, cold reload. The map still draws from the saved area.
ofmBlocked = true
await context.setOffline(true)
const before = tileRequests
await page.reload()
await page.waitForSelector('.fa-map__canvas canvas', { timeout: 15000 }).catch(() => fail('MapLibre canvas missing offline'))
await page.waitForTimeout(2500)
const px = await centrePixel()
if (!isMagenta(px)) await fail('base map did not draw offline: ' + px)
if (!(await page.locator('.leaflet-control-attribution', { hasText: 'OpenFreeMap' }).count())) await fail('OpenFreeMap attribution missing')
if (tileRequests !== before) await fail('tiles were fetched from the network while offline')
await page.getByRole('button', { name: /map layers/i }).click()
const sat = page.getByRole('listitem').filter({ hasText: 'Satellite' }).or(page.locator('.v-list-item', { hasText: 'Satellite' })).first()
if (!(await sat.getAttribute('class')).includes('v-list-item--disabled')) await fail('Satellite should be greyed out offline')
if (!(await page.getByText("You're offline. Saved areas still show.").isVisible())) await fail('offline note missing')
await page.waitForTimeout(500)
if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/offline-menu.png` })
await page.keyboard.press('Escape')

// Back online: satellite draws and the choice sticks across a reload.
ofmBlocked = false
await context.setOffline(false)
await page.evaluate(() => window.dispatchEvent(new Event('online')))
await page.getByRole('button', { name: /map layers/i }).click()
await page.locator('.v-list-item', { hasText: 'Satellite' }).first().click()
await page.keyboard.press('Escape')
await page.waitForTimeout(1500)
let p2 = await centrePixel()
if (!(p2[1] > 150 && p2[0] < 60)) await fail('satellite layer did not draw: ' + p2)
await page.reload()
await page.waitForTimeout(3000)
p2 = await centrePixel()
if (!(p2[1] > 150 && p2[0] < 60)) await fail('layer choice was not remembered: ' + p2)

// Removing the only area empties the offline cache.
await page.getByRole('button', { name: /map layers/i }).click()
await page.getByRole('button', { name: /remove around you/i }).click()
await page.waitForTimeout(1000)
if ((await areas()).length !== 0) await fail('area still listed after removing')
if ((await savedFiles()) !== 0) await fail('offline cache not emptied: ' + (await savedFiles()))

console.log('PASS offline map')
await browser.close()
server.kill()
