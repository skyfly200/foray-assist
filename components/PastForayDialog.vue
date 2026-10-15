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
        <v-btn block variant="tonal" rounded="xl" prepend-icon="mdi-image-multiple" :loading="reading" class="mb-3" @click="fileInput?.click()">
          {{ files.length ? `Change photos (${files.length})` : 'Pick photos' }}
        </v-btn>
        <v-alert v-if="files.length && !reading" :type="summary?.fromExif ? 'success' : 'info'" variant="tonal" density="compact" class="mb-4" data-testid="past-foray-summary">
          <div>{{ whenText }}</div>
          <div v-if="summary?.center">
            {{ place ? `Near ${place}` : placeLoading ? 'Looking up the place…' : 'Location found' }}
            ({{ summary.gpsCount }} of {{ files.length }} geotagged)
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

const router = useRouter()
const { setMode } = useMode()
const open = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const files = ref<File[]>([])
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
  summary.value = null
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
  return `${files.value.length} photo${files.value.length === 1 ? '' : 's'} · ${d}, ${range}${s.fromExif ? '' : ' (from file dates)'}`
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
    summary.value = summarizePhotos(await Promise.all(picked.map((f) => readPhotoMeta(f))))
    if (summary.value) day.value = summary.value.day
    place.value = null
    if (summary.value?.center) void lookUpPlace(summary.value.center)
  } finally {
    reading.value = false
  }
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
    if (files.value.length) {
      await importFiles(row.id, files.value)
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
