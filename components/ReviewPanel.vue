<template>
  <div>
    <v-card class="fa-card mb-4" variant="flat" color="primary">
      <v-card-text class="d-flex flex-wrap align-center ga-3">
        <v-btn color="white" class="text-primary" size="large" prepend-icon="mdi-image-plus" :disabled="busy" @click="picker?.click()">Add photos</v-btn>
        <input ref="picker" type="file" accept="image/*" multiple hidden @change="onPick" />
        <v-btn variant="outlined" color="white" size="large" prepend-icon="mdi-auto-fix" :disabled="busy || !unassigned.length" :loading="grouping" @click="group">
          Group into finds
          <span v-if="unassigned.length" class="count-bubble ml-2">{{ unassigned.length }}</span>
        </v-btn>
        <span v-if="message" class="text-body-2 w-100">{{ message }}</span>
      </v-card-text>
      <Transition name="fa-pop">
        <div v-if="progress" class="px-4 pb-4" role="status" aria-live="polite">
          <div class="text-body-2 font-weight-bold mb-1">
            <v-icon icon="mdi-leaf" size="16" class="spin-leaf" /> Looking at your photos…
            <span class="font-weight-regular">{{ progress.done }}/{{ progress.total }}</span>
          </div>
          <v-progress-linear
            :model-value="(progress.done / Math.max(1, progress.total)) * 100"
            height="10"
            rounded
            color="white"
            bg-color="white"
            bg-opacity="0.3"
          />
        </div>
      </Transition>
    </v-card>

    <!-- SLOT: photo sources (e.g. Google Photos import) are mounted here. They write Photo rows with specimenRowId '' -->
    <slot name="sources" />

    <div v-if="progress && !photos.length" class="d-flex flex-column ga-4" aria-hidden="true">
      <div class="fa-shimmer skeleton" />
    </div>

    <TransitionGroup name="fa-list" tag="div" class="d-flex flex-column ga-4">
      <ClusterCard v-if="unassigned.length" key="__unassigned" :find="null" :photos="unassigned" :other-finds="finds.map(label)" />
      <ClusterCard v-for="f in finds" :key="f.id" :find="f" :photos="photosBySpecimen.get(f.id) ?? []" :other-finds="finds.filter((o) => o.id !== f.id).map(label)" />
      <div v-if="!finds.length && !unassigned.length && !progress" key="__empty" class="text-center text-medium-emphasis py-6">
        <div class="empty-emoji" aria-hidden="true">📷</div>
        No photos yet. Add photos taken outside the app to get started.
      </div>
    </TransitionGroup>
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

<style scoped>
.count-bubble { display: inline-grid; place-items: center; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 999px; background: rgba(255, 255, 255, 0.3); font-size: 0.75rem; }
.skeleton { height: 160px; border-radius: var(--fa-radius); }
.empty-emoji { font-size: 3rem; }
.spin-leaf { animation: sway 1.2s ease-in-out infinite alternate; }
@keyframes sway { from { transform: rotate(-20deg); } to { transform: rotate(20deg); } }
@media (prefers-reduced-motion: reduce) { .spin-leaf { animation: none; } }
</style>
