<template>
  <v-card class="fa-card" variant="flat">
    <v-card-title class="d-flex align-center flex-wrap ga-2">
      <span v-if="!find" class="text-subtitle-1 font-weight-bold">Ungrouped photos</span>
      <span v-else-if="pending" class="fa-badge id-pending" title="You'll get an ID when you sign in and have a connection">
        <v-icon icon="mdi-timer-sand" size="14" /> ID pending
        <v-tooltip activator="parent" location="bottom">You'll get an ID when you sign in and have a connection</v-tooltip>
      </span>
      <span v-else class="text-subtitle-1 font-weight-bold">{{ displayId(find.specimenId) }}</span>
      <span v-if="species" class="text-body-2 font-italic species">{{ species }}</span>
      <span class="fa-badge"><v-icon icon="mdi-check-circle" size="14" /> {{ selectedCount }}/{{ photos.length }} selected</span>
      <v-spacer />
      <span v-if="find" class="text-caption text-medium-emphasis">{{ timeLabel }}</span>
      <v-menu>
        <template #activator="{ props: mp }">
          <v-btn v-bind="mp" icon="mdi-dots-vertical" size="small" variant="text" :aria-label="find ? 'Find options' : 'Ungrouped photo options'" />
        </template>
        <v-list density="compact">
          <template v-if="find">
            <v-list-subheader v-if="otherFinds.length">Merge into</v-list-subheader>
            <v-list-item v-for="o in otherFinds" :key="o.id" :title="o.label" prepend-icon="mdi-call-merge" @click="ask('merge', o)" />
            <v-divider v-if="otherFinds.length" class="my-1" />
            <v-list-item v-if="photos.length" title="Ungroup photos" prepend-icon="mdi-image-off" @click="ungroup" />
            <v-list-item title="Delete find" prepend-icon="mdi-delete" base-color="error" @click="ask('delete')" />
          </template>
          <v-list-item v-else title="Delete all ungrouped photos" prepend-icon="mdi-delete" base-color="error" @click="ask('deleteUngrouped')" />
        </v-list>
      </v-menu>
    </v-card-title>
    <v-card-text>
      <div v-if="!photos.length" class="text-medium-emphasis">No photos in this find.</div>
      <TransitionGroup name="fa-list" tag="div" class="thumbs">
        <div v-for="(t, i) in thumbs" :key="t.photo.id" class="thumb" :class="{ selected: t.photo.isSelected, scoring: typeof t.photo.blurScore !== 'number' }">
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
              <v-divider class="my-1" />
              <v-list-item v-if="find && i > 0" title="Split from here" subtitle="This and later photos become a new find" prepend-icon="mdi-call-split" @click="split(t.photo.id)" />
              <v-list-item title="Delete photo" prepend-icon="mdi-delete" base-color="error" @click="ask('deletePhoto', undefined, t.photo.id)" />
            </v-list>
          </v-menu>
        </div>
      </TransitionGroup>
      <div class="text-caption text-medium-emphasis mt-2">Tap a photo to approve or un-approve it. Use a photo's menu to move, split or delete it.</div>
    </v-card-text>

    <v-dialog v-model="confirm.open" max-width="380">
      <v-card :title="confirm.title" :text="confirm.text">
        <v-card-actions>
          <v-spacer />
          <v-btn @click="confirm.open = false">Cancel</v-btn>
          <v-btn :color="confirm.kind === 'merge' ? 'primary' : 'error'" :loading="busy" @click="onConfirm">{{ confirm.action }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { deleteFind } from '~/composables/useFinds'
import { deleteSortedPhoto, deleteUngrouped, mergeFinds, movePhoto, movePhotoToNewFind, setPhotoSelected, splitFindAt, ungroupFind } from '~/composables/useReview'
import { ensurePhotoBlob } from '~/composables/useMedia'
import type { Photo, Specimen } from '~/utils/db'
import { displayId, isPendingId } from '~/utils/idCode'

const props = defineProps<{
  find: Specimen | null
  photos: Photo[]
  otherFinds: { id: string; label: string }[]
}>()

const pending = computed(() => !!props.find && isPendingId(props.find.specimenId))
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
    for (const p of list) {
      if (urls.has(p.id)) continue
      if (p.blob) urls.set(p.id, URL.createObjectURL(p.blob))
      else void ensurePhotoBlob(p)
    }
    thumbs.value = [...list].filter((p) => urls.has(p.id)).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt) || (a.id < b.id ? -1 : 1)).map((p) => ({ photo: p, url: urls.get(p.id)! }))
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

const species = computed(() => props.find?.fieldNotes.speciesGuess?.trim() ?? '')
const findName = computed(() => (!props.find ? '' : pending.value ? 'this find' : displayId(props.find.specimenId)))

// One confirm dialog for the actions that remove or combine finds and photos.
type Kind = 'merge' | 'delete' | 'deletePhoto' | 'deleteUngrouped'
const confirm = ref({ open: false, kind: 'delete' as Kind, title: '', text: '', action: '', target: '', photoId: '' })
const busy = ref(false)
function ask(kind: Kind, target?: { id: string; label: string }, photoId = '') {
  const n = props.photos.length
  const texts: Record<Kind, [string, string, string]> = {
    merge: [`Merge into ${target?.label}?`, `Its ${n} photo${n === 1 ? '' : 's'}, voice notes and notes move to ${target?.label}, and ${findName.value} is removed. Where both have a value, the other one is kept in Notes.`, 'Merge'],
    delete: [`Delete ${findName.value}?`, `This removes the find and its ${n} photo${n === 1 ? '' : 's'} from this device. To keep the photos, use Ungroup photos instead.`, 'Delete'],
    deletePhoto: ['Delete this photo?', 'It is removed from this device.', 'Delete'],
    deleteUngrouped: [`Delete ${n} ungrouped photo${n === 1 ? '' : 's'}?`, 'They are removed from this device.', 'Delete all'],
  }
  const [title, text, action] = texts[kind]
  confirm.value = { open: true, kind, title, text, action, target: target?.id ?? '', photoId }
}
async function onConfirm() {
  const c = confirm.value
  busy.value = true
  try {
    if (c.kind === 'merge' && props.find) await mergeFinds(props.find.id, c.target)
    else if (c.kind === 'delete' && props.find) await deleteFind(props.find.id)
    else if (c.kind === 'deletePhoto') await deleteSortedPhoto(c.photoId)
    else if (c.kind === 'deleteUngrouped' && props.photos[0]) await deleteUngrouped(props.photos[0].forayId)
  } finally {
    busy.value = false
    confirm.value.open = false
  }
}
const ungroup = () => props.find && ungroupFind(props.find.id)
const split = (id: string) => splitFindAt(id)

const toggle = (p: Photo) => setPhotoSelected(p.id, !p.isSelected)
const move = (id: string, target: string) => movePhoto(id, target)
const moveNew = (id: string) => movePhotoToNewFind(id)
</script>

<style scoped>
.id-pending { color: #8a5a00; background: #fff3d6; }
.species { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.thumbs { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 10px; }
@media (min-width: 960px) {
  .thumbs { grid-template-columns: repeat(auto-fill, minmax(124px, 1fr)); gap: 12px; }
}
@media (min-width: 960px) and (hover: hover) {
  .thumb:not(.selected):hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25); }
  .thumb .move { opacity: 0; transition: opacity .15s; }
  .thumb:hover .move, .thumb:focus-within .move, .move[aria-expanded='true'] { opacity: 1; }
}
.thumb img:focus-visible { outline: 3px solid rgb(var(--v-theme-info)); outline-offset: 2px; }
.thumb { position: relative; border-radius: 20px; aspect-ratio: 1; box-shadow: 0 0 0 0 transparent; transition: box-shadow .2s var(--fa-ease), transform .2s var(--fa-ease); }
.thumb.scoring img { animation: pulse-img 1.4s ease-in-out infinite alternate; }
@keyframes pulse-img { from { opacity: .7; } to { opacity: 1; } }
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
@media (prefers-reduced-motion: reduce) { .tone-pending .v-icon, .thumb.scoring img { animation: none; } }
</style>
