<script setup lang="ts">
// Map: every find with a GPS fix, as a pin, over a base layer picked from utils/mapLayers.ts.
// Pins are your finds plus other members' finds in shared forays; pins close together merge into a
// numbered cluster (utils/mapCluster.ts). The default base map is OpenFreeMap vector tiles drawn by
// MapLibre; the area around you is saved for offline use (composables/useOfflineMap.ts).
// Satellite and terrain need a connection.
import { liveQuery } from 'dexie'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'maplibre-gl/dist/maplibre-gl.css'
import { mapPoints, missingFixes, type MapFind, type MapPeer, type MapPhoto, type MapPoint } from '~/utils/findMap'
import { clusterPoints } from '~/utils/mapCluster'
import { displayId, isPendingId } from '~/utils/idCode'
import { BASE_LAYERS, DEFAULT_LAYER, baseLayer, type BaseLayer } from '~/utils/mapLayers'
import { formatBytes } from '~/utils/offlineMap'
import { prepareBaseStyle } from '~/composables/useOfflineMap'

const router = useRouter()
const el = ref<HTMLElement | null>(null)
const forays = ref<Foray[]>([])
const finds = ref<MapFind[]>([])
const photos = ref<MapPhoto[]>([])
const peers = ref<MapPeer[]>([])
const loaded = ref(false)
const forayFilter = ref<string | null>(null)
const locating = ref(false)
const locateError = ref('')
const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine)
const layerId = ref(DEFAULT_LAYER)
const baseError = ref('')
const offline = useOfflineMap()
const { areas, saving, error: saveError } = offline
const savingPct = computed(() => (saving.value ? Math.round((saving.value.done / Math.max(1, saving.value.total)) * 100) : 0))
const shownLayer = computed(() => {
  const l = baseLayer(layerId.value)
  return l.offline || online.value ? l : baseLayer(DEFAULT_LAYER)
})

const forayNames = computed(() => Object.fromEntries(forays.value.map((f) => [f.id, f.name])))
const points = computed(() => mapPoints({ finds: finds.value, photos: photos.value, peers: peers.value, forayNames: forayNames.value, forayId: forayFilter.value }))
const shownMine = computed(() => points.value.filter((p) => p.source === 'mine').length)
const shownPeers = computed(() => points.value.length - shownMine.value)
const missing = computed(() => missingFixes(finds.value, photos.value, forayFilter.value))
const forayItems = computed(() => [{ title: 'All forays', value: null }, ...forays.value.map((f) => ({ title: f.name, value: f.id }))])

let map: L.Map | null = null
let layer: L.LayerGroup | null = null
let me: L.CircleMarker | null = null
let sub: { unsubscribe(): void } | null = null
let fitted = false
let base: L.Layer | null = null
let baseFor = ''
let gone = false
const OFM_ATTRIBUTION = '<a href="https://openfreemap.org">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

async function makeBase(l: BaseLayer): Promise<L.Layer> {
  if (l.kind === 'raster') {
    return L.tileLayer(l.url, { maxZoom: 19, maxNativeZoom: l.maxNativeZoom, attribution: l.attribution })
  }
  // MapLibre is big; load it only for the vector base map.
  const maplibre = await import('maplibre-gl')
  const { maplibreGL } = await import('@maplibre/maplibre-gl-leaflet')
  const style = await prepareBaseStyle(maplibre)
  // The Leaflet layer shows customAttribution in Leaflet's own attribution box.
  return maplibreGL({ style, attributionControl: { customAttribution: OFM_ATTRIBUTION } })
}

async function showBase() {
  if (!map) return
  const l = shownLayer.value
  if (baseFor === l.id) return
  baseFor = l.id
  baseError.value = ''
  try {
    const next = await makeBase(l)
    if (gone || !map || baseFor !== l.id) return
    if (base) map.removeLayer(base)
    base = next.addTo(map)
  } catch (e) {
    console.warn('base map failed', e)
    baseFor = ''
    baseError.value = online.value ? "The base map didn't load." : 'No map saved for offline use here yet.'
  }
}

async function pickLayer(id: string) {
  layerId.value = id
  try { await useDb().settings.put({ key: 'mapLayer', value: id }) } catch { /* keep in memory */ }
}

function saveView() {
  if (!map) return
  const c = map.getCenter()
  void offline.saveArea(c.lat, c.lng, `Area near ${c.lat.toFixed(3)}, ${c.lng.toFixed(3)}`)
}

function showArea(lat: number, lng: number) {
  map?.setView([lat, lng], 13)
}

function placeMe(lat: number, lng: number) {
  if (!map) return
  const ll: [number, number] = [lat, lng]
  if (!me) {
    // A soft pulsing halo sits under the blue dot so "you are here" is easy to spot.
    L.circleMarker(ll, { radius: 22, weight: 0, fillColor: '#1e88e5', fillOpacity: 0.18, interactive: false, className: 'fa-map-halo' }).addTo(map)
    me = L.circleMarker(ll, { radius: 8, weight: 3, color: '#ffffff', fillColor: '#1e88e5', fillOpacity: 1, className: 'fa-map-me' }).addTo(map)
  } else me.setLatLng(ll)
}

/** Without asking: if location is already allowed, save the map around you for offline use. */
async function quietLocate() {
  try {
    const p = await navigator.permissions?.query({ name: 'geolocation' as PermissionName })
    if (p?.state !== 'granted') return
  } catch { return }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      placeMe(pos.coords.latitude, pos.coords.longitude)
      if (!fitted && !points.value.length) map?.setView([pos.coords.latitude, pos.coords.longitude], 13)
      void offline.ensureAround(pos.coords.latitude, pos.coords.longitude)
    },
    () => {},
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 },
  )
}

const onOnline = () => { online.value = true }
const onOffline = () => { online.value = false }

function popup(p: MapPoint) {
  const box = document.createElement('div')
  box.className = 'fa-map-pop'
  const title = document.createElement('div')
  title.className = 'fa-map-pop__title'
  title.textContent = `🍄 ${p.title}`
  const meta = document.createElement('div')
  meta.className = 'fa-map-pop__meta'
  const who = p.author ? ` · ${p.author}` : ''
  meta.textContent = `${isPendingId(p.specimenId) ? 'ID pending' : displayId(p.specimenId)} · ${new Date(p.at).toLocaleDateString()} · ${p.forayName}${who}`
  const open = document.createElement('button')
  open.type = 'button'
  open.className = 'fa-map-pop__open'
  open.textContent = 'Open foray'
  open.onclick = () => router.push(`/forays/${p.forayId}`)
  box.append(title, meta, open)
  return box
}

function pin(p: MapPoint) {
  const mine = p.source === 'mine'
  L.circleMarker([p.lat, p.lng], {
    radius: 9,
    weight: 3,
    color: '#ffffff',
    fillColor: mine ? '#1b8a5a' : '#7b4fb0',
    fillOpacity: 1,
    className: 'fa-map-pin',
  })
    .bindPopup(() => popup(p))
    .addTo(layer!)
}

/** A numbered bubble for pins that are close together. Clicking it zooms in to those pins. */
function cluster(lat: number, lng: number, members: MapPoint[]) {
  const icon = L.divIcon({
    className: 'fa-map-cluster',
    html: `<span>${members.length}</span>`,
    iconSize: [38, 38],
  })
  L.marker([lat, lng], { icon, title: `${members.length} finds here. Click to zoom in.`, keyboard: true })
    .on('click', () => {
      if (!map) return
      const b = L.latLngBounds(members.map((p) => [p.lat, p.lng] as [number, number]))
      map.fitBounds(b, { padding: [48, 48], maxZoom: 18 })
    })
    .addTo(layer!)
}

function draw() {
  if (!map || !layer) return
  layer.clearLayers()
  for (const c of clusterPoints(points.value, map.getZoom())) {
    if (c.points.length === 1) pin(c.points[0]!)
    else cluster(c.lat, c.lng, c.points)
  }
  if (!fitted && points.value.length) {
    fitted = true
    fitAll()
  }
}

function fitAll() {
  if (!map || !points.value.length) return
  const b = L.latLngBounds(points.value.map((p) => [p.lat, p.lng] as [number, number]))
  map.fitBounds(b, { padding: [40, 40], maxZoom: 16 })
}

function locate() {
  if (!map || !navigator.geolocation) return
  locating.value = true
  locateError.value = ''
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      locating.value = false
      placeMe(pos.coords.latitude, pos.coords.longitude)
      map!.setView([pos.coords.latitude, pos.coords.longitude], Math.max(map!.getZoom(), 15))
      void offline.ensureAround(pos.coords.latitude, pos.coords.longitude)
    },
    () => {
      locating.value = false
      locateError.value = "Couldn't get your location."
    },
    { enableHighAccuracy: true, timeout: 10000 },
  )
}

watch(points, draw)
watch(shownLayer, () => void showBase())
watch(forayFilter, () => {
  fitted = false
  draw()
})

onMounted(async () => {
  map = L.map(el.value!, { zoomControl: false, attributionControl: true, maxZoom: 19 }).setView([39.5, -98.35], 4)
  L.control.zoom({ position: 'bottomright' }).addTo(map)
  layer = L.layerGroup().addTo(map)
  map.on('zoomend', draw)
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  const db = useDb()
  try {
    const saved = (await db.settings.get('mapLayer'))?.value
    if (typeof saved === 'string' && BASE_LAYERS.some((l) => l.id === saved)) layerId.value = saved
  } catch { /* default layer */ }
  if (gone) return
  void showBase()
  void offline.load()
  void quietLocate()
  sub = liveQuery(async () => ({
    forays: await db.forays.orderBy('startedAt').reverse().toArray(),
    finds: await db.specimens.toArray(),
    // Only the fields the map reads: a photo's image blob stays in the database.
    photos: (await db.photos.toArray()).map(({ specimenRowId, capturedAt, latitude, longitude }) => ({ specimenRowId, capturedAt, latitude, longitude })),
    peers: (await db.peerFinds.toArray()).map(({ id, forayId, authorName, specimenId, timestamp, latitude, longitude, geoprivacy, fieldNotes }) => ({
      id, forayId, authorName, specimenId, timestamp, latitude, longitude, geoprivacy, fieldNotes,
    })),
  })).subscribe({
    next: (r) => {
      forays.value = r.forays
      finds.value = r.finds
      photos.value = r.photos
      peers.value = r.peers
      loaded.value = true
    },
    error: (e) => console.error('map query failed', e),
  })
})
onBeforeUnmount(() => {
  gone = true
  window.removeEventListener('online', onOnline)
  window.removeEventListener('offline', onOffline)
  sub?.unsubscribe()
  map?.remove()
  map = null
})
</script>

<template>
  <div class="fa-map">
    <div class="fa-map__bar">
      <v-select
        v-model="forayFilter"
        :items="forayItems"
        density="compact"
        variant="solo"
        hide-details
        rounded="xl"
        prepend-inner-icon="mdi-pine-tree"
        aria-label="Show finds from"
        class="fa-map__filter"
      />
      <v-btn icon="mdi-fit-to-screen-outline" size="small" color="surface" aria-label="Show all finds" :disabled="!points.length" @click="fitAll" />
      <v-btn icon="mdi-crosshairs-gps" size="small" color="surface" aria-label="Show where I am" :loading="locating" @click="locate" />
      <v-menu location="bottom end" :close-on-content-click="false">
        <template #activator="{ props: act }">
          <v-btn v-bind="act" icon="mdi-layers-outline" size="small" color="surface" aria-label="Map layers and offline areas" />
        </template>
        <v-card class="fa-map-menu" rounded="lg" min-width="280" max-width="340">
          <v-list density="compact" aria-label="Map layer">
            <v-list-subheader>Map layer</v-list-subheader>
            <v-list-item
              v-for="l in BASE_LAYERS"
              :key="l.id"
              :prepend-icon="l.icon"
              :title="l.name"
              :subtitle="l.note"
              :active="shownLayer.id === l.id"
              :disabled="!l.offline && !online"
              lines="two"
              color="primary"
              @click="pickLayer(l.id)"
            />
          </v-list>
          <v-divider />
          <v-list density="compact" aria-label="Saved for offline">
            <v-list-subheader>Saved for offline</v-list-subheader>
            <v-list-item v-if="!areas.length && !saving" class="text-medium-emphasis" title="Nothing saved yet" subtitle="The area around you saves on its own when location is on." />
            <v-list-item
              v-for="a in areas"
              :key="a.id"
              prepend-icon="mdi-map-check-outline"
              :title="a.name"
              :subtitle="`${formatBytes(a.bytes)} · ${new Date(a.savedAt).toLocaleDateString()}`"
              @click="showArea(a.lat, a.lng)"
            >
              <template #append>
                <v-btn icon="mdi-delete-outline" size="small" variant="text" :aria-label="`Remove ${a.name}`" @click.stop="offline.removeArea(a.id)" />
              </template>
            </v-list-item>
            <v-list-item v-if="saving" prepend-icon="mdi-download" :title="`Saving ${saving.name}`">
              <v-progress-linear :model-value="savingPct" color="primary" rounded class="mt-1" />
            </v-list-item>
          </v-list>
          <v-card-actions>
            <v-btn prepend-icon="mdi-download-outline" variant="tonal" color="primary" block :disabled="!online || !!saving" @click="saveView">Save this area</v-btn>
          </v-card-actions>
          <div v-if="saveError" class="fa-map-menu__err">{{ saveError }}</div>
          <div v-else-if="!online" class="fa-map-menu__err">You're offline. Saved areas still show.</div>
        </v-card>
      </v-menu>
    </div>
    <div ref="el" class="fa-map__canvas" role="region" aria-label="Map of your finds" />
    <div v-if="loaded" class="fa-map__note" role="status">
      <template v-if="!points.length">🗺️ No pins yet. Finds drop one here when your phone knows where you are.</template>
      <template v-else>
        🍄 {{ shownMine }} find{{ shownMine === 1 ? '' : 's' }} of yours on the map<template v-if="shownPeers > 0"> · {{ shownPeers }} from others</template><template v-if="missing > 0"> · {{ missing }} without a location</template>
      </template>
      <span v-if="locateError"> · {{ locateError }}</span>
      <span v-if="baseError"> · {{ baseError }}</span>
      <span v-if="saving"> · Saving map for offline {{ savingPct }}%</span>
    </div>
  </div>
</template>

<style scoped>
.fa-map { position: relative; margin: -12px; height: calc(100dvh - 64px - 96px - env(safe-area-inset-bottom)); }
.fa-map__canvas { position: absolute; inset: 0; z-index: 0; }
.fa-map__bar { position: absolute; top: 10px; left: 10px; right: 10px; z-index: 2; display: flex; gap: 8px; align-items: center; }
.fa-map__filter { flex: 1; max-width: 320px; }
.fa-map__note {
  position: absolute; left: 10px; bottom: 26px; z-index: 2; max-width: calc(100% - 70px);
  padding: 6px 12px; border-radius: 14px; font-size: 0.8rem; font-weight: 600;
  background: rgba(var(--v-theme-surface), 0.94); box-shadow: var(--fa-shadow);
}
.fa-map-menu__err { padding: 0 16px 12px; font-size: 0.8rem; opacity: 0.8; }
/* Pins pop in when drawn; the halo breathes. Transforms only, so it stays smooth on phones. */
:deep(.fa-map-pin) { filter: drop-shadow(0 3px 4px rgba(20, 60, 40, 0.35)); transform-box: fill-box; transform-origin: center; animation: fa-map-pin-in .45s var(--fa-ease) both; }
:deep(.fa-map-pin:hover) { transform: scale(1.25); transition: transform .15s var(--fa-ease); }
:deep(.fa-map-halo) { transform-box: fill-box; transform-origin: center; animation: fa-map-halo 2.4s ease-in-out infinite; }
@keyframes fa-map-pin-in { from { transform: scale(0) translateY(-6px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes fa-map-halo { 0%, 100% { transform: scale(.8); opacity: .9; } 50% { transform: scale(1.1); opacity: .4; } }
@media (prefers-reduced-motion: reduce) { :deep(.fa-map-pin), :deep(.fa-map-halo) { animation: none; } }
:deep(.leaflet-popup-content-wrapper) { border-radius: var(--fa-radius-sm); box-shadow: var(--fa-shadow-lift); }
:deep(.leaflet-control-zoom a) { border-radius: 12px !important; }
:deep(.leaflet-control-zoom) { border: 0 !important; box-shadow: var(--fa-shadow) !important; border-radius: 12px; overflow: hidden; }
:deep(.fa-map-cluster) { display: grid; place-items: center; background: none; border: 0; }
:deep(.fa-map-cluster span) {
  display: grid; place-items: center; width: 38px; height: 38px; border-radius: 50%;
  background: rgb(var(--v-theme-primary)); color: #fff; font-weight: 800; font-size: 0.9rem;
  border: 3px solid #fff; box-shadow: var(--fa-shadow);
}
:deep(.fa-map-pop__title) { font-weight: 800; font-size: 0.95rem; }
:deep(.fa-map-pop__meta) { font-size: 0.78rem; opacity: 0.75; margin: 2px 0 8px; }
:deep(.fa-map-pop__open) { font: inherit; font-weight: 700; color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), 0.12); border: 0; border-radius: 999px; padding: 4px 12px; cursor: pointer; }
@media (min-width: 600px) { .fa-map { margin: -16px; } }
@media (min-width: 960px) { .fa-map { height: calc(100dvh - 32px); margin: -16px; border-radius: var(--fa-radius); overflow: hidden; } }
</style>
