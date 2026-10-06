<template>
  <v-card class="fa-card" variant="flat">
    <v-card-title class="d-flex align-center flex-wrap ga-2">
      <span class="text-subtitle-1 font-weight-bold">{{ find ? find.specimenId : 'Ungrouped photos' }}</span>
      <span class="fa-badge"><v-icon icon="mdi-check-circle" size="14" /> {{ selectedCount }}/{{ photos.length }} selected</span>
      <v-spacer />
      <span v-if="find" class="text-caption text-medium-emphasis">{{ timeLabel }}</span>
    </v-card-title>
    <v-card-text>
      <div v-if="!photos.length" class="text-medium-emphasis">No photos in this find.</div>
      <TransitionGroup name="fa-list" tag="div" class="thumbs">
        <div v-for="t in thumbs" :key="t.photo.id" class="thumb" :class="{ selected: t.photo.isSelected }">
          <img :src="t.url" alt="Find photo" role="button" tabindex="0" :aria-pressed="t.photo.isSelected" @click="toggle(t.photo)" @keydown.enter="toggle(t.photo)" />
          <span class="badge" :class="`tone-${tone(t.photo)}`">
            <v-icon :icon="tone(t.photo) === 'success' ? 'mdi-star' : tone(t.photo) === 'pending' ? 'mdi-timer-sand' : 'mdi-leaf'" size="12" />
            {{ badge(t.photo) }}
          </span>
          <Transition name="fa-check">
            <span v-if="t.photo.isSelected" class="check fa-check-pop" aria-hidden="true"><v-icon icon="mdi-check" size="16" color="white" /></span>
          </Transition>
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
      </TransitionGroup>
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
const tone = (p: Photo) => (typeof p.blurScore !== 'number' ? 'pending' : p.blurScore < 30 ? 'error' : p.blurScore < 100 ? 'warning' : 'success')

const toggle = (p: Photo) => setPhotoSelected(p.id, !p.isSelected)
const move = (id: string, target: string) => movePhoto(id, target)
const moveNew = (id: string) => movePhotoToNewFind(id)
</script>

<style scoped>
.thumbs { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 10px; }
.thumb { position: relative; border-radius: 20px; aspect-ratio: 1; box-shadow: 0 0 0 0 transparent; transition: box-shadow .2s var(--fa-ease), transform .2s var(--fa-ease); }
.thumb.selected { box-shadow: 0 0 0 4px rgb(var(--v-theme-primary)); transform: scale(0.97); }
.thumb img { width: 100%; height: 100%; object-fit: cover; border-radius: 20px; display: block; cursor: pointer; }
.badge { position: absolute; left: 6px; bottom: 6px; display: inline-flex; align-items: center; gap: 3px; padding: 2px 8px; border-radius: 999px; font-size: 0.72rem; font-weight: 700; color: #fff; }
.tone-success { background: rgb(var(--v-theme-success)); }
.tone-warning { background: rgb(var(--v-theme-warning)); }
.tone-error { background: rgb(var(--v-theme-error)); }
.tone-pending { background: rgba(0, 0, 0, 0.55); }
.tone-pending .v-icon { animation: spin 2s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.check { position: absolute; right: 6px; top: 6px; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: rgb(var(--v-theme-primary)); box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3); }
.move { position: absolute; right: 4px; bottom: 4px; }
.fa-check-leave-active { transition: transform .15s, opacity .15s; }
.fa-check-leave-to { transform: scale(0); opacity: 0; }
@media (prefers-reduced-motion: reduce) { .tone-pending .v-icon { animation: none; } }
</style>
