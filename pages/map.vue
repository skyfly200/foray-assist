<script setup lang="ts">
// Map: every find with a GPS fix, as a pin. Tiles come from OpenStreetMap and are cached as you
// look at them, so areas you've already viewed still show offline.
import { liveQuery } from 'dexie'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { mapPoints, type MapPoint } from '~/utils/findMap'
import { displayId, isPendingId } from '~/utils/idCode'

const router = useRouter()
const el = ref<HTMLElement | null>(null)
const forays = ref<Foray[]>([])
const finds = ref<Specimen[]>([])
const loaded = ref(false)
const forayFilter = ref<string | null>(null)
const locating = ref(false)
const locateError = ref('')

const forayNames = computed(() => Object.fromEntries(forays.value.map((f) => [f.id, f.name])))
const points = computed(() => mapPoints(finds.value, forayNames.value, forayFilter.value))
const missing = computed(() => {
  const inScope = forayFilter.value ? finds.value.filter((f) => f.forayId === forayFilter.value) : finds.value
  return inScope.length - points.value.length
})
const forayItems = computed(() => [{ title: 'All forays', value: null }, ...forays.value.map((f) => ({ title: f.name, value: f.id }))])

let map: L.Map | null = null
let layer: L.LayerGroup | null = null
let me: L.CircleMarker | null = null
let sub: { unsubscribe(): void } | null = null
let fitted = false

function popup(p: MapPoint, specimenId: string) {
  const box = document.createElement('div')
  box.className = 'fa-map-pop'
  const title = document.createElement('div')
  title.className = 'fa-map-pop__title'
  title.textContent = p.title
  const meta = document.createElement('div')
  meta.className = 'fa-map-pop__meta'
  meta.textContent = `${isPendingId(specimenId) ? 'ID pending' : displayId(specimenId)} · ${new Date(p.at).toLocaleDateString()} · ${p.forayName}`
  const open = document.createElement('button')
  open.type = 'button'
  open.className = 'fa-map-pop__open'
  open.textContent = 'Open foray'
  open.onclick = () => router.push(`/forays/${p.forayId}`)
  box.append(title, meta, open)
  return box
}

function draw() {
  if (!map || !layer) return
  layer.clearLayers()
  const ids = new Map(finds.value.map((f) => [f.id, f.specimenId]))
  for (const p of points.value) {
    L.circleMarker([p.lat, p.lng], { radius: 9, weight: 3, color: '#ffffff', fillColor: '#1b8a5a', fillOpacity: 1 })
      .bindPopup(() => popup(p, ids.get(p.id) ?? ''))
      .addTo(layer)
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
      const ll: [number, number] = [pos.coords.latitude, pos.coords.longitude]
      if (!me) me = L.circleMarker(ll, { radius: 8, weight: 3, color: '#ffffff', fillColor: '#1e88e5', fillOpacity: 1 }).addTo(map!)
      else me.setLatLng(ll)
      map!.setView(ll, Math.max(map!.getZoom(), 15))
    },
    () => {
      locating.value = false
      locateError.value = "Couldn't get your location."
    },
    { enableHighAccuracy: true, timeout: 10000 },
  )
}

watch(points, draw)
watch(forayFilter, () => {
  fitted = false
  draw()
})

onMounted(() => {
  map = L.map(el.value!, { zoomControl: false, attributionControl: true }).setView([39.5, -98.35], 4)
  L.control.zoom({ position: 'bottomright' }).addTo(map)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map)
  layer = L.layerGroup().addTo(map)
  const db = useDb()
  sub = liveQuery(async () => ({ forays: await db.forays.orderBy('startedAt').reverse().toArray(), finds: await db.specimens.toArray() })).subscribe({
    next: (r) => {
      forays.value = r.forays
      finds.value = r.finds
      loaded.value = true
    },
    error: (e) => console.error('map query failed', e),
  })
})
onBeforeUnmount(() => {
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
    </div>
    <div ref="el" class="fa-map__canvas" role="region" aria-label="Map of your finds" />
    <div v-if="loaded" class="fa-map__note" role="status">
      <template v-if="!points.length">No finds with a location yet. Finds get one when your phone has GPS as you make them.</template>
      <template v-else>{{ points.length }} find{{ points.length === 1 ? '' : 's' }} on the map<template v-if="missing > 0"> · {{ missing }} without a location</template></template>
      <span v-if="locateError"> · {{ locateError }}</span>
    </div>
  </div>
</template>

<style scoped>
.fa-map { position: relative; margin: -12px; height: calc(100dvh - 64px - 96px - env(safe-area-inset-bottom)); }
.fa-map__canvas { position: absolute; inset: 0; z-index: 0; }
.fa-map__bar { position: absolute; top: 10px; left: 10px; right: 10px; z-index: 2; display: flex; gap: 8px; align-items: center; }
.fa-map__filter { flex: 1; max-width: 320px; }
.fa-map__note {
  position: absolute; left: 10px; bottom: 10px; z-index: 2; max-width: calc(100% - 70px);
  padding: 6px 12px; border-radius: 14px; font-size: 0.8rem; font-weight: 600;
  background: rgba(var(--v-theme-surface), 0.94); box-shadow: var(--fa-shadow);
}
:deep(.fa-map-pop__title) { font-weight: 800; font-size: 0.95rem; }
:deep(.fa-map-pop__meta) { font-size: 0.78rem; opacity: 0.75; margin: 2px 0 8px; }
:deep(.fa-map-pop__open) { font: inherit; font-weight: 700; color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), 0.12); border: 0; border-radius: 999px; padding: 4px 12px; cursor: pointer; }
@media (min-width: 600px) { .fa-map { margin: -16px; } }
@media (min-width: 960px) { .fa-map { height: calc(100dvh - 32px); margin: -16px; border-radius: var(--fa-radius); overflow: hidden; } }
</style>
