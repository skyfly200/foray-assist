<template>
  <div>
    <v-card variant="tonal" class="mb-4">
      <v-card-text class="d-flex flex-wrap align-center ga-3">
        <v-btn color="primary" prepend-icon="mdi-image-plus" :disabled="busy" @click="picker?.click()">Add photos</v-btn>
        <input ref="picker" type="file" accept="image/*" multiple hidden @change="onPick" />
        <v-btn prepend-icon="mdi-group" :disabled="busy || !unassigned.length" :loading="grouping" @click="group">
          Group into finds
          <v-chip v-if="unassigned.length" size="x-small" class="ml-2">{{ unassigned.length }}</v-chip>
        </v-btn>
        <span v-if="message" class="text-caption">{{ message }}</span>
      </v-card-text>
      <v-progress-linear v-if="progress" :model-value="(progress.done / Math.max(1, progress.total)) * 100" height="6" />
      <div v-if="progress" class="text-caption px-4 pb-2">Scoring sharpness {{ progress.done }}/{{ progress.total }}</div>
    </v-card>

    <!-- SLOT: photo sources (e.g. Google Photos import) are mounted here. They write Photo rows with specimenRowId '' -->
    <slot name="sources" />

    <div class="d-flex flex-column ga-4">
      <ClusterCard v-if="unassigned.length" :find="null" :photos="unassigned" :other-finds="finds.map(label)" />
      <ClusterCard v-for="f in finds" :key="f.id" :find="f" :photos="photosBySpecimen.get(f.id) ?? []" :other-finds="finds.filter((o) => o.id !== f.id).map(label)" />
      <div v-if="!finds.length && !unassigned.length" class="text-medium-emphasis">No photos yet. Add photos taken outside the app to get started.</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useLiveQuery } from '~/composables/useFinds'
import { clusterUnassigned, importFiles, scorePhotos } from '~/composables/useReview'
import type { Photo, Specimen } from '~/utils/db'

const props = defineProps<{ forayId: string }>()

const picker = ref<HTMLInputElement | null>(null)
const busy = ref(false)
const grouping = ref(false)
const message = ref('')
const progress = ref<{ done: number; total: number } | null>(null)

const finds = useLiveQuery<Specimen[]>(
  async () => (await useDb().specimens.where('forayId').equals(props.forayId).toArray()).sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
  [],
)
const photos = useLiveQuery<Photo[]>(() => useDb().photos.where('forayId').equals(props.forayId).toArray(), [])

const unassigned = computed(() => photos.value.filter((p) => p.specimenRowId === ''))
const photosBySpecimen = computed(() => {
  const m = new Map<string, Photo[]>()
  for (const p of photos.value) if (p.specimenRowId) m.set(p.specimenRowId, [...(m.get(p.specimenRowId) ?? []), p])
  return m
})
const label = (f: Specimen) => ({ id: f.id, label: f.specimenId })

async function runScoring() {
  progress.value = { done: 0, total: 0 }
  try {
    await scorePhotos(props.forayId, (done, total) => (progress.value = { done, total }))
  } finally {
    progress.value = null
  }
}

async function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (!files.length) return
  busy.value = true
  try {
    const r = await importFiles(props.forayId, files)
    message.value = `Added ${r.added}${r.skipped ? `, skipped ${r.skipped} duplicate/non-image` : ''}.`
    await runScoring()
  } catch (err) {
    message.value = `Import failed: ${(err as Error).message}`
  } finally {
    busy.value = false
  }
}

async function group() {
  busy.value = grouping.value = true
  try {
    await runScoring() // photos from other sources (Google Photos) may be unscored
    const r = await clusterUnassigned(props.forayId)
    message.value = `Created ${r.created} new find(s), merged into ${r.merged} existing; ${r.photos} photos grouped.`
  } catch (err) {
    message.value = `Grouping failed: ${(err as Error).message}`
  } finally {
    busy.value = grouping.value = false
  }
}
</script>
