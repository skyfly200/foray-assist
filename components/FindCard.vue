<template>
  <v-card class="fa-card find-card" variant="flat">
    <div class="cover" :class="{ empty: !cover }">
      <img v-if="cover" :key="cover.id" :src="cover.url" alt="Cover photo of this find" class="cover-img" />
      <div v-else class="cover-empty" aria-hidden="true">🍄</div>
      <span class="fa-badge id-pill">{{ find.specimenId }}</span>
      <span class="time-pill">{{ timeLabel }}</span>
      <span v-if="burst" :key="burst" class="fa-burst" aria-hidden="true"><i v-for="n in 10" :key="n" :style="{ '--i': n }" /></span>
    </div>

    <v-card-text>
      <TransitionGroup v-if="thumbs.length" name="fa-list" tag="div" class="thumbs mb-3">
        <div v-for="t in thumbs" :key="t.id" class="thumb">
          <img :src="t.url" alt="Find photo" />
          <v-btn
            icon="mdi-close"
            size="x-small"
            variant="flat"
            class="thumb-x"
            aria-label="Remove photo"
            @click="removePhoto(t.id)"
          />
        </div>
      </TransitionGroup>

      <PhotoCapture :specimen-row-id="find.id" :foray-id="find.forayId" class="mb-3" />

      <VoiceRecorder :foray-id="find.forayId" :specimen-row-id="find.id" class="mb-3" />

      <AttributeForm :specimen-row-id="find.id" :model-value="find.fieldNotes" class="mb-2" />

      <v-expansion-panels variant="accordion" class="sections">
        <v-expansion-panel rounded="lg" elevation="0">
          <v-expansion-panel-title>
            <v-icon :icon="privacyIcon" class="mr-2" color="primary" /> Location privacy
            <span class="text-caption text-medium-emphasis ml-2">{{ privacyLabel }}</span>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-btn-toggle
              class="privacy w-100"
              color="primary"
              variant="outlined"
              rounded="xl"
              mandatory
              divided
              :model-value="find.geoprivacy"
              aria-label="Location privacy"
              @update:model-value="(v: Geoprivacy) => v && setGeoprivacy(find.id, v)"
            >
              <v-btn v-for="o in privacyItems" :key="o.value" :value="o.value" :prepend-icon="o.icon" class="flex-grow-1">{{ o.short }}</v-btn>
            </v-btn-toggle>
            <div class="text-caption text-medium-emphasis mt-2">{{ privacyLabel }}</div>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </v-card-text>

    <v-card-actions class="px-4 pb-4">
      <PrintLabelButton :specimen-row-id="find.id" />
      <v-spacer />
      <v-btn color="error" variant="text" prepend-icon="mdi-delete" @click="confirmOpen = true">Delete</v-btn>
    </v-card-actions>

    <v-dialog v-model="confirmOpen" max-width="360">
      <v-card :title="`Delete ${find.specimenId}?`" text="This removes the find and its photos from this device.">
        <v-card-actions>
          <v-spacer />
          <v-btn @click="confirmOpen = false">Cancel</v-btn>
          <v-btn color="error" @click="onDelete">Delete</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { deleteFind, removePhoto, setGeoprivacy, useLiveQuery } from '~/composables/useFinds'
import type { Geoprivacy, Photo, Specimen } from '~/utils/db'

const props = defineProps<{ find: Specimen }>()
const confirmOpen = ref(false)

const privacyItems = [
  { title: 'Open (exact location)', short: 'Open', value: 'open', icon: 'mdi-lock-open-variant' },
  { title: 'Obscured', short: 'Obscured', value: 'obscured', icon: 'mdi-lock-outline' },
  { title: 'Private', short: 'Private', value: 'private', icon: 'mdi-lock' },
]
const privacyCurrent = computed(() => privacyItems.find((o) => o.value === props.find.geoprivacy) ?? privacyItems[1])
const privacyIcon = computed(() => privacyCurrent.value.icon)
const privacyLabel = computed(() => privacyCurrent.value.title)

const timeLabel = computed(() => new Date(props.find.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }))

const photos = useLiveQuery<Photo[]>(
  async () => {
    const rows = await useDb().photos.where('specimenRowId').equals(props.find.id).toArray()
    return rows.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
  },
  [],
)

// Object URLs keyed by photo id; created lazily and revoked when removed/unmounted.
const urls = new Map<string, string>()
const thumbs = ref<{ id: string; url: string }[]>([])
// Cover = first selected photo, else first photo.
const cover = computed(() => {
  const sel = photos.value.find((p) => p.isSelected)
  const id = (sel ?? photos.value[0])?.id
  return thumbs.value.find((t) => t.id === id) ?? null
})
// Confetti burst when a photo is added after the initial load.
const burst = ref(0)
let seen = -1

watch(
  photos,
  (list) => {
    const keep = new Set(list.map((p) => p.id))
    for (const [id, url] of urls) {
      if (!keep.has(id)) {
        URL.revokeObjectURL(url)
        urls.delete(id)
      }
    }
    for (const p of list) if (!urls.has(p.id)) urls.set(p.id, URL.createObjectURL(p.blob))
    thumbs.value = list.map((p) => ({ id: p.id, url: urls.get(p.id)! }))
    if (seen >= 0 && list.length > seen) burst.value++
    seen = list.length
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  for (const url of urls.values()) URL.revokeObjectURL(url)
  urls.clear()
})

async function onDelete() {
  confirmOpen.value = false
  await deleteFind(props.find.id)
}
</script>

<style scoped>
.find-card { overflow: visible; }
.cover { position: relative; aspect-ratio: 4 / 3; border-radius: var(--fa-radius) var(--fa-radius) 0 0; overflow: hidden; background: var(--fa-hero-gradient); }
.cover-img { width: 100%; height: 100%; object-fit: cover; display: block; animation: fa-pop .35s var(--fa-ease); }
.cover-empty { height: 100%; display: grid; place-items: center; font-size: 4rem; opacity: 0.85; }
.id-pill { position: absolute; left: 12px; top: 12px; background: rgb(var(--v-theme-surface)); color: rgb(var(--v-theme-primary)); font-size: 0.95rem; box-shadow: var(--fa-shadow); }
.time-pill { position: absolute; right: 12px; bottom: 12px; padding: 2px 10px; border-radius: 999px; font-size: 0.75rem; font-weight: 600; background: rgba(0, 0, 0, 0.5); color: #fff; }
.thumbs { display: flex; gap: 8px; overflow-x: auto; padding: 2px; scroll-snap-type: x proximity; }
.thumb { position: relative; flex: 0 0 auto; scroll-snap-align: start; }
.thumb img { width: 72px; height: 72px; object-fit: cover; border-radius: 16px; display: block; }
.thumb-x { position: absolute; top: 2px; right: 2px; }
.sections { gap: 8px; display: flex; flex-direction: column; }
.sections :deep(.v-expansion-panel) { background: rgba(var(--v-theme-primary), 0.06); border-radius: var(--fa-radius-sm) !important; }
.sections :deep(.v-expansion-panel::after) { display: none; }
.privacy { height: 48px; }
</style>
