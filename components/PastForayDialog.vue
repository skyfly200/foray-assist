<template>
  <v-dialog v-model="open" max-width="460">
    <template #activator="{ props: act }">
      <slot name="activator" :props="act">
        <v-btn v-bind="act" variant="tonal" rounded="xl" prepend-icon="mdi-calendar-clock">Log a past foray</v-btn>
      </slot>
    </template>
    <v-card class="fa-card" title="Log a past foray">
      <v-card-text>
        <p class="mb-4 text-medium-emphasis">
          Pick the photos from that day and the date and place fill in from them. They land in the foray ready to sort into finds.
        </p>
        <input ref="fileInput" type="file" accept="image/*" multiple hidden data-testid="past-foray-files" @change="onFiles" />
        <div class="past-sources mb-3">
          <v-btn variant="tonal" rounded="xl" prepend-icon="mdi-image-multiple" :loading="reading" @click="fileInput?.click()">
            {{ files.length ? `Phone (${files.length})` : 'From phone' }}
          </v-btn>
          <v-btn variant="tonal" rounded="xl" prepend-icon="mdi-google" :disabled="!!googleBlocked || g.busy.value" :loading="g.busy.value" data-testid="past-foray-google" @click="onGoogle">
            {{ googlePicks.length ? `Google (${googlePicks.length})` : 'Google Photos' }}
          </v-btn>
        </div>
        <p v-if="googleBlocked" class="text-caption text-medium-emphasis mt-n2 mb-3">{{ googleBlocked }}</p>
        <v-alert v-if="g.phase.value === 'waiting'" type="info" variant="tonal" density="compact" class="mb-3">
          Choose photos in the Google tab, then come back here.
          <a v-if="g.pickerUrl.value" :href="g.pickerUrl.value" target="_blank" rel="noopener">Open picker</a>
          <v-btn size="small" variant="text" @click="g.cancel()">Cancel</v-btn>
        </v-alert>
        <v-progress-linear v-if="g.phase.value === 'downloading'" class="mb-3" rounded height="8" color="primary" :model-value="g.progress.value.total ? (g.progress.value.done / g.progress.value.total) * 100 : 0" />
        <v-alert v-if="g.error.value" type="error" variant="tonal" density="compact" class="mb-3">{{ g.error.value }}</v-alert>
        <v-alert v-if="photoCount && !reading" :type="summary?.fromExif ? 'success' : 'info'" variant="tonal" density="compact" class="mb-4" data-testid="past-foray-summary">
          <div>{{ whenText }}</div>
          <div v-if="summary?.center">
            {{ place ? `Near ${place}` : placeLoading ? 'Looking up the place…' : 'Location found' }}
            ({{ summary.gpsCount }} of {{ photoCount }} geotagged)
          </div>
          <div v-else>No location in these photos.</div>
        </v-alert>
        <v-text-field v-model="day" type="date" label="Date" variant="outlined" density="comfortable" :max="today" data-testid="past-foray-date" />
        <v-text-field v-model="name" label="Name" variant="outlined" density="comfortable" maxlength="80" data-testid="past-foray-name" @update:model-value="nameTouched = true" />
        <v-alert v-if="error" type="error" variant="tonal" density="compact">{{ error }}</v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="open = false">Cancel</v-btn>
        <v-btn color="primary" variant="flat" rounded="xl" :loading="busy" :disabled="!day || reading" data-testid="past-foray-create" @click="onCreate">Create foray</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { readPhotoMeta } from '~/utils/exif'
import { localDay, pastForayName, pastForayTimes, placeFromNominatim, summarizePhotos, type PastForaySummary } from '~/utils/pastForay'
import { startForay } from '~/composables/useNewFind'
import { importFiles } from '~/composables/useReview'
import { googlePhotoStamp, saveGooglePhotos, useGooglePhotos, type PickedGooglePhoto } from '~/composables/useGooglePhotos'
import type { PhotoStamp } from '~/utils/pastForay'

const router = useRouter()
const { setMode } = useMode()
const open = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const files = ref<File[]>([])
const fileStamps = ref<PhotoStamp[]>([])
const googlePicks = ref<PickedGooglePhoto[]>([])
const googleStamps = ref<PhotoStamp[]>([])
const photoCount = computed(() => files.value.length + googlePicks.value.length)
const { online, signedIn } = useSync()
const g = useGooglePhotos()
const googleBlocked = computed(() =>
  !online.value ? 'Google Photos needs internet.'
  : !signedIn.value ? 'Sign in on the Settings page to use Google Photos.'
  : g.status.value && !g.connected.value ? 'Connect Google Photos on the Settings page first.' : '')
const summary = ref<PastForaySummary | null>(null)
const today = localDay(new Date())
const day = ref(today)
const name = ref('')
const nameTouched = ref(false)
const place = ref<string | null>(null)
const placeLoading = ref(false)
const reading = ref(false)
const busy = ref(false)
const error = ref('')

watch(open, (v) => {
  if (!v) return
  files.value = []
  fileStamps.value = []
  googlePicks.value = []
  googleStamps.value = []
  summary.value = null
  if (signedIn.value && online.value) g.refreshStatus()
  day.value = today
  name.value = ''
  nameTouched.value = false
  place.value = null
  error.value = ''
})

// Keep the suggested name in step with the date and place until the user types their own.
watch([day, place], () => {
  if (!nameTouched.value && day.value) name.value = pastForayName(day.value, place.value)
}, { immediate: true })

const whenText = computed(() => {
  const s = summary.value
  if (!s) return ''
  const t = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const d = new Date(s.startedAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  const range = s.startedAt === s.endedAt ? t(s.startedAt) : `${t(s.startedAt)} to ${t(s.endedAt)}`
  return `${photoCount.value} photo${photoCount.value === 1 ? '' : 's'} · ${d}, ${range}${s.fromExif ? '' : ' (from file dates)'}`
})

async function onFiles(e: Event) {
  const input = e.target as HTMLInputElement
  const picked = Array.from(input.files ?? [])
  input.value = ''
  if (!picked.length) return
  reading.value = true
  error.value = ''
  try {
    files.value = picked
    fileStamps.value = await Promise.all(picked.map((f) => readPhotoMeta(f)))
    resummarize()
  } finally {
    reading.value = false
  }
}

async function onGoogle() {
  const r = await g.pickAndDownload()
  if (!r.photos.length) return
  reading.value = true
  try {
    googlePicks.value = r.photos
    googleStamps.value = await Promise.all(r.photos.map((p) => googlePhotoStamp(p)))
    resummarize()
  } finally {
    reading.value = false
  }
}

/** Date and place from every photo picked so far, phone and Google together. */
function resummarize() {
  const prev = summary.value?.center
  summary.value = summarizePhotos([...fileStamps.value, ...googleStamps.value])
  if (summary.value) day.value = summary.value.day
  const c = summary.value?.center
  if (c && prev && c.latitude === prev.latitude && c.longitude === prev.longitude) {
    summary.value!.center = prev
    return
  }
  place.value = null
  if (c) void lookUpPlace(c)
}

/** Best effort: names the place from OpenStreetMap. Offline or slow just leaves the name date-only. */
async function lookUpPlace(c: { latitude: number; longitude: number }) {
  placeLoading.value = true
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 6000)
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&lat=${c.latitude.toFixed(5)}&lon=${c.longitude.toFixed(5)}`
    const res = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } })
    if (res.ok && summary.value?.center === c) place.value = placeFromNominatim(await res.json())
  } catch {
    /* offline or blocked */
  } finally {
    clearTimeout(timer)
    placeLoading.value = false
  }
}

async function onCreate() {
  if (!day.value) return
  busy.value = true
  error.value = ''
  try {
    const row = await startForay(name.value, pastForayTimes(day.value, summary.value))
    if (photoCount.value) {
      if (files.value.length) await importFiles(row.id, files.value)
      if (googlePicks.value.length) await saveGooglePhotos(row.id, googlePicks.value)
      open.value = false
      // Photos from a past day get sorted into finds, which is Review mode's Sort photos tab.
      await setMode('review')
      router.push({ path: `/forays/${row.id}`, query: { tab: 'photos' } })
    } else {
      open.value = false
      router.push(`/forays/${row.id}`)
    }
  } catch (e: any) {
    error.value = e?.message ?? 'Could not create the foray.'
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.past-sources { display: flex; flex-wrap: wrap; gap: 8px; }
.past-sources > * { flex: 1 1 120px; min-width: 0; }
</style>
