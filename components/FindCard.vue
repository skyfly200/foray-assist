<template>
  <v-card variant="outlined">
    <v-card-title class="d-flex align-center flex-wrap ga-2">
      <span class="text-subtitle-1 font-weight-bold">{{ find.specimenId }}</span>
      <v-spacer />
      <span class="text-caption text-medium-emphasis">{{ timeLabel }}</span>
    </v-card-title>

    <v-card-text>
      <div v-if="thumbs.length" class="thumbs mb-3">
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
      </div>

      <PhotoCapture :specimen-row-id="find.id" :foray-id="find.forayId" class="mb-3" />

      <AttributeForm :specimen-row-id="find.id" :model-value="find.fieldNotes" />

      <v-select
        class="mt-3"
        label="Location privacy"
        density="comfortable"
        hide-details
        :items="privacyItems"
        :model-value="find.geoprivacy"
        @update:model-value="(v: Geoprivacy) => setGeoprivacy(find.id, v)"
      />
    </v-card-text>

    <v-card-actions>
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
  { title: 'Open (exact location)', value: 'open' },
  { title: 'Obscured', value: 'obscured' },
  { title: 'Private', value: 'private' },
]

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
.thumbs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
}
.thumb {
  position: relative;
  flex: 0 0 auto;
}
.thumb img {
  width: 88px;
  height: 88px;
  object-fit: cover;
  border-radius: 8px;
  display: block;
}
.thumb-x {
  position: absolute;
  top: 2px;
  right: 2px;
}
</style>
