<template>
  <v-card variant="outlined">
    <v-card-title class="d-flex align-center flex-wrap ga-2">
      <span class="text-subtitle-1 font-weight-bold">{{ find ? find.specimenId : 'Ungrouped photos' }}</span>
      <v-chip size="x-small" variant="tonal">{{ selectedCount }}/{{ photos.length }} selected</v-chip>
      <v-spacer />
      <span v-if="find" class="text-caption text-medium-emphasis">{{ timeLabel }}</span>
    </v-card-title>
    <v-card-text>
      <div v-if="!photos.length" class="text-medium-emphasis">No photos in this find.</div>
      <div class="thumbs">
        <div v-for="t in thumbs" :key="t.photo.id" class="thumb" :class="{ selected: t.photo.isSelected }">
          <img :src="t.url" alt="Find photo" role="button" tabindex="0" :aria-pressed="t.photo.isSelected" @click="toggle(t.photo)" @keydown.enter="toggle(t.photo)" />
          <v-chip class="badge" size="x-small" :color="badgeColor(t.photo)" variant="flat">{{ badge(t.photo) }}</v-chip>
          <v-icon v-if="t.photo.isSelected" class="check" color="success" icon="mdi-check-circle" />
          <v-menu>
            <template #activator="{ props: mp }">
              <v-btn v-bind="mp" class="move" icon="mdi-dots-vertical" size="x-small" variant="flat" aria-label="Move photo" />
            </template>
            <v-list density="compact">
              <v-list-subheader>Move to</v-list-subheader>
              <v-list-item v-for="o in otherFinds" :key="o.id" :title="o.label" @click="move(t.photo.id, o.id)" />
              <v-list-item title="New find" prepend-icon="mdi-plus" @click="moveNew(t.photo.id)" />
              <v-list-item v-if="find" title="Ungrouped" prepend-icon="mdi-image-off" @click="move(t.photo.id, '')" />
            </v-list>
          </v-menu>
        </div>
      </div>
      <div class="text-caption text-medium-emphasis mt-2">Tap a photo to approve or un-approve it.</div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { movePhoto, movePhotoToNewFind, setPhotoSelected } from '~/composables/useReview'
import type { Photo, Specimen } from '~/utils/db'

const props = defineProps<{
  find: Specimen | null
  photos: Photo[]
  otherFinds: { id: string; label: string }[]
}>()

const timeLabel = computed(() => (props.find ? new Date(props.find.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : ''))
const selectedCount = computed(() => props.photos.filter((p) => p.isSelected).length)

const urls = new Map<string, string>()
const thumbs = ref<{ photo: Photo; url: string }[]>([])
watch(
  () => props.photos,
  (list) => {
    const keep = new Set(list.map((p) => p.id))
    for (const [id, url] of urls) {
      if (!keep.has(id)) {
        URL.revokeObjectURL(url)
        urls.delete(id)
      }
    }
    for (const p of list) if (!urls.has(p.id)) urls.set(p.id, URL.createObjectURL(p.blob))
    thumbs.value = [...list].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt)).map((p) => ({ photo: p, url: urls.get(p.id)! }))
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  for (const u of urls.values()) URL.revokeObjectURL(u)
  urls.clear()
})

const badge = (p: Photo) => (typeof p.blurScore === 'number' ? Math.round(p.blurScore).toString() : '...')
// Heuristic colour only; scores are relative within a foray.
const badgeColor = (p: Photo) => (typeof p.blurScore !== 'number' ? 'grey' : p.blurScore < 30 ? 'error' : p.blurScore < 100 ? 'warning' : 'success')

const toggle = (p: Photo) => setPhotoSelected(p.id, !p.isSelected)
const move = (id: string, target: string) => movePhoto(id, target)
const moveNew = (id: string) => movePhotoToNewFind(id)
</script>

<style scoped>
.thumbs { display: flex; flex-wrap: wrap; gap: 8px; }
.thumb { position: relative; border-radius: 8px; border: 3px solid transparent; }
.thumb.selected { border-color: rgb(var(--v-theme-success)); }
.thumb img { width: 96px; height: 96px; object-fit: cover; border-radius: 5px; display: block; cursor: pointer; }
.badge { position: absolute; left: 4px; bottom: 4px; }
.check { position: absolute; right: 4px; top: 4px; background: white; border-radius: 50%; }
.move { position: absolute; right: 2px; bottom: 2px; }
</style>
