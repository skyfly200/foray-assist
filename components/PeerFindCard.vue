<template>
  <v-card class="fa-card peer-card" variant="flat">
    <div class="cover" :class="{ empty: !cover }">
      <img v-if="cover" :src="cover" alt="Photo of this find" class="cover-img" />
      <div v-else class="cover-empty" aria-hidden="true">🍄</div>
      <span v-if="find.specimenId" class="fa-badge id-pill">{{ displayId(find.specimenId) }}</span>
      <span v-else class="fa-badge id-pill id-pending">ID pending</span>
      <span class="time-pill">{{ timeLabel }}</span>
    </div>
    <v-card-text>
      <div class="d-flex align-center ga-2 mb-1">
        <v-avatar size="28" color="secondary" variant="tonal">{{ initials }}</v-avatar>
        <b>{{ find.authorName }}</b>
        <v-chip v-if="find.source !== 'server'" size="x-small" variant="tonal" :prepend-icon="find.source === 'file' ? 'mdi-file-download-outline' : 'mdi-bluetooth'">
          {{ find.source === 'file' ? 'Received file' : 'Nearby' }}
        </v-chip>
      </div>
      <div v-if="find.fieldNotes.speciesGuess" class="text-subtitle-1 font-italic">{{ find.fieldNotes.speciesGuess }}</div>
      <div class="text-caption text-medium-emphasis mb-2">
        <v-icon :icon="locIcon" size="14" /> {{ locLabel }}
        <span v-if="find.voucherId"> · Voucher {{ displayId(find.voucherId) }}</span>
      </div>
      <div v-if="noteLines.length" class="notes mb-2">
        <div v-for="[k, v] in noteLines" :key="k"><span class="text-medium-emphasis">{{ k }}:</span> {{ v }}</div>
      </div>
      <v-expansion-panels v-if="find.source === 'server'" variant="accordion" class="sections">
        <v-expansion-panel rounded="lg" elevation="0">
          <v-expansion-panel-title>
            <v-icon icon="mdi-comment-multiple-outline" class="mr-2" color="primary" /> Comments and IDs
            <span v-if="commentCount" class="text-caption text-medium-emphasis ml-2">{{ commentCount }}</span>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <CommentThread :foray-id="find.forayId" :specimen-row-id="find.id" />
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import type { PeerFindRow } from '~/utils/db'
import { displayId } from '~/utils/idCode'
import { sharedPhotoUrl } from '~/composables/useSharedForay'
import { useLiveQuery } from '~/composables/useFinds'

const props = defineProps<{ find: PeerFindRow }>()

const LABELS: Record<string, string> = {
  substrate: 'Substrate', hostTree: 'Host tree', odor: 'Smell', capTexture: 'Cap', staining: 'Staining', notes: 'Notes', voiceTranscripts: 'Voice notes',
}
const noteLines = computed(() => Object.entries(props.find.fieldNotes ?? {}).filter(([k, v]) => k !== 'speciesGuess' && v).map(([k, v]) => [LABELS[k] ?? k, v] as const))
const timeLabel = computed(() => new Date(props.find.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }))
const initials = computed(() => props.find.authorName.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?')

const locIcon = computed(() => ({ open: 'mdi-map-marker', obscured: 'mdi-map-marker-radius-outline', private: 'mdi-lock' } as Record<string, string>)[props.find.geoprivacy])
const locLabel = computed(() => {
  const f = props.find
  if (f.geoprivacy === 'private' || f.latitude == null || f.longitude == null) return 'Location private'
  const at = `${f.latitude.toFixed(f.geoprivacy === 'open' ? 4 : 1)}, ${f.longitude.toFixed(f.geoprivacy === 'open' ? 4 : 1)}`
  return f.geoprivacy === 'open' ? at : `Somewhere near ${at} (about 20 km area)`
})

const commentCount = useLiveQuery<number>(() => useDb().comments.where('specimenRowId').equals(props.find.id).count(), 0)

// Cover: a received blob, or a signed URL for a member's uploaded photo.
const cover = ref('')
let objectUrl = ''
watch(() => props.find.photos, async (photos) => {
  const p = photos.find((x) => x.isSelected) ?? photos[0]
  if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = '' }
  if (!p) { cover.value = ''; return }
  if (p.blob) { objectUrl = URL.createObjectURL(p.blob); cover.value = objectUrl; return }
  cover.value = p.storagePath ? (await sharedPhotoUrl(p.storagePath)) ?? '' : ''
}, { immediate: true })
onBeforeUnmount(() => { if (objectUrl) URL.revokeObjectURL(objectUrl) })
</script>

<style scoped>
.cover { position: relative; aspect-ratio: 16 / 9; border-radius: var(--fa-radius) var(--fa-radius) 0 0; overflow: hidden; background: var(--fa-hero-gradient); }
.cover-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cover-empty { height: 100%; display: grid; place-items: center; font-size: 3rem; opacity: 0.85; }
.id-pill { position: absolute; left: 12px; top: 12px; background: rgb(var(--v-theme-surface)); color: rgb(var(--v-theme-primary)); font-size: 0.9rem; box-shadow: var(--fa-shadow); }
.id-pill.id-pending { color: #8a5a00; background: #fff3d6; }
.time-pill { position: absolute; right: 12px; bottom: 12px; padding: 2px 10px; border-radius: 999px; font-size: 0.75rem; font-weight: 600; background: rgba(0, 0, 0, 0.5); color: #fff; }
.notes { font-size: 0.85rem; }
.sections :deep(.v-expansion-panel) { background: rgba(var(--v-theme-primary), 0.06); border-radius: var(--fa-radius-sm) !important; }
.sections :deep(.v-expansion-panel::after) { display: none; }
</style>
