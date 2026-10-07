<script setup lang="ts">
import { liveQuery } from 'dexie'
import type { Geoprivacy } from '~/utils/db'
import { displayId, isPendingId } from '~/utils/idCode'
const props = defineProps<{ forayId: string }>()
const { connected, signedIn, online, queue, retry, setGeoprivacy, observationUrl } = usePublish()

interface Row { id: string; label: string; pending: boolean; guess: string; photos: number; geoprivacy: Geoprivacy; status: string; error?: string; obsId?: number }
const rows = ref<Row[]>([])
const checked = ref<string[]>([])
let sub: any

onMounted(() => {
  sub = liveQuery(async () => {
    const db = useDb()
    const specs = await db.specimens.where('forayId').equals(props.forayId).sortBy('timestamp')
    const photos = await db.photos.where('forayId').equals(props.forayId).toArray()
    return specs.map((s): Row => ({
      id: s.id, label: isPendingId(s.specimenId) ? 'ID pending' : displayId(s.specimenId), pending: isPendingId(s.specimenId), guess: s.fieldNotes?.speciesGuess ?? '', geoprivacy: s.geoprivacy,
      photos: photos.filter((p) => p.specimenRowId === s.id && p.isSelected).length,
      status: s.inatStatus ?? 'draft', error: s.inatError, obsId: s.iNatObservationId,
    }))
  }).subscribe({ next: (r) => (rows.value = r), error: () => {} })
})
onBeforeUnmount(() => sub?.unsubscribe())

const eligible = (r: Row) => !r.pending && (r.status === 'draft' || r.status === 'failed')
const selectable = computed(() => rows.value.filter(eligible))
const ready = computed(() => signedIn.value && connected.value)
const pendingCount = computed(() => rows.value.filter((r) => r.pending && r.status !== 'published').length)
const colors: Record<string, string> = { draft: 'grey', queued: 'info', published: 'success', failed: 'error' }
const icons: Record<string, string> = { draft: 'mdi-pencil-outline', queued: 'mdi-clock-outline', published: 'mdi-check-circle', failed: 'mdi-alert-circle' }
const publishedCount = computed(() => rows.value.filter((r) => r.status === 'published').length)
const allDone = computed(() => rows.value.length > 0 && publishedCount.value === rows.value.length)
// Celebrate when a find flips to published while this panel is open.
const burst = ref(0)
let lastPublished = -1
watch(publishedCount, (n) => {
  if (lastPublished >= 0 && n > lastPublished) burst.value++
  lastPublished = n
}, { immediate: true })
const geoOptions = [{ title: 'Open', value: 'open', icon: 'mdi-lock-open-variant' }, { title: 'Obscured', value: 'obscured', icon: 'mdi-lock-outline' }, { title: 'Private', value: 'private', icon: 'mdi-lock' }]

async function publishSelected() {
  const ids = [...checked.value]
  checked.value = []
  for (const id of ids) {
    const r = rows.value.find((x) => x.id === id)
    if (r?.status === 'failed') await retry(id)
  }
  await queue(ids)
}
</script>

<template>
  <v-card class="fa-card pub-panel" variant="flat">
    <v-card-title class="d-flex align-center ga-2 pub-title">
      <v-icon icon="mdi-cloud-upload" color="primary" /> Publish to iNaturalist
    </v-card-title>
    <v-card-text>
      <v-alert v-if="!ready" type="info" variant="tonal" density="compact" class="mb-3">
        {{ !signedIn ? 'Sign in and connect iNaturalist in Settings.' : 'Connect iNaturalist in Settings.' }}
        You can still queue finds; they publish once connected and online.
      </v-alert>
      <v-alert v-else-if="!online" type="info" variant="tonal" density="compact" class="mb-3" icon="mdi-wifi-off">
        Offline: queued finds publish when you reconnect.
      </v-alert>

      <v-alert v-if="pendingCount" type="warning" variant="tonal" density="compact" class="mb-3" icon="mdi-timer-sand">
        {{ pendingCount }} find{{ pendingCount === 1 ? '' : 's' }} still waiting for an ID and left out of 'Publish selected'. Sign in with a connection to get IDs.
      </v-alert>

      <div v-if="allDone" :key="burst" class="success-banner fa-celebrate mb-3" role="status">
        <span class="fa-burst" aria-hidden="true"><i v-for="n in 10" :key="n" :style="{ '--i': n }" /></span>
        <div class="success-emoji" aria-hidden="true">🎉</div>
        <div class="font-weight-bold">All {{ publishedCount }} find{{ publishedCount === 1 ? '' : 's' }} published!</div>
        <div class="text-caption">Nice foraying.</div>
      </div>

      <div v-if="!rows.length" class="text-body-2 text-center text-medium-emphasis py-4">
        <div class="success-emoji" aria-hidden="true">🌱</div>
        No finds in this foray yet.
      </div>
      <TransitionGroup v-else name="fa-list" tag="div" class="d-flex flex-column ga-3 pub-list">
        <v-card v-for="r in rows" :key="r.id" variant="tonal" :color="r.status === 'published' ? 'success' : r.status === 'failed' ? 'error' : undefined" class="row-card" rounded="lg">
          <div class="d-flex align-start pa-3 ga-2 pub-row">
            <v-checkbox-btn v-model="checked" :value="r.id" :disabled="!eligible(r)" :aria-label="`Select ${r.label}`" />
            <div class="flex-grow-1 min-w-0">
              <div class="d-flex align-center flex-wrap ga-2">
                <span v-if="r.pending" class="fa-badge id-pending">
                  <v-icon icon="mdi-timer-sand" size="14" /> ID pending
                  <v-tooltip activator="parent" location="bottom">You'll get an ID when you sign in and have a connection</v-tooltip>
                </span>
                <span v-else class="font-weight-bold">{{ r.label }}</span>
                <v-chip size="small" :color="colors[r.status]" variant="flat" :prepend-icon="icons[r.status]" class="fa-pill">{{ r.status }}</v-chip>
              </div>
              <div v-if="r.pending" class="text-caption text-warning-emphasis pending-note">Can't publish yet: you'll get an ID when you sign in and have a connection.</div>
              <div v-if="r.guess" class="text-body-2 text-medium-emphasis">{{ r.guess }}</div>
              <div class="text-caption">
                {{ r.photos }} selected photo{{ r.photos === 1 ? '' : 's' }}
                <span v-if="r.status === 'failed' && r.error" class="text-error"> · {{ r.error }}</span>
              </div>
              <v-btn-toggle
                class="mt-2 geo-toggle"
                density="comfortable"
                variant="outlined"
                color="primary"
                rounded="xl"
                mandatory
                divided
                :model-value="r.geoprivacy"
                :disabled="r.status === 'published' || r.status === 'queued'"
                :aria-label="`Location privacy for ${r.label}`"
                @update:model-value="(v: Geoprivacy) => v && setGeoprivacy(r.id, v)"
              >
                <v-btn v-for="o in geoOptions" :key="o.value" :value="o.value" :prepend-icon="o.icon" size="small">{{ o.title }}</v-btn>
              </v-btn-toggle>
              <div class="d-flex align-center flex-wrap ga-2 mt-1">
                <v-btn v-if="r.status === 'failed'" size="small" variant="tonal" prepend-icon="mdi-refresh" @click="retry(r.id)">Retry</v-btn>
                <a v-if="r.obsId" :href="observationUrl(r.obsId)" target="_blank" rel="noopener" class="text-body-2">View on iNaturalist</a>
              </div>
            </div>
          </div>
        </v-card>
      </TransitionGroup>
    </v-card-text>
    <v-card-actions class="flex-wrap ga-2 px-4 pb-4 pub-actions">
      <v-btn color="primary" variant="flat" size="x-large" block prepend-icon="mdi-rocket-launch" :disabled="!checked.length" @click="publishSelected">
        Publish to iNaturalist ({{ checked.length }})
      </v-btn>
      <v-btn variant="text" :disabled="!selectable.length" @click="checked = selectable.map((r) => r.id)">Select all</v-btn>
    </v-card-actions>
  </v-card>
</template>

<style scoped>
.id-pending { color: #8a5a00; background: #fff3d6; }
.pending-note { color: #8a5a00; }
.min-w-0 { min-width: 0; }
.success-banner { position: relative; text-align: center; padding: 16px; border-radius: var(--fa-radius); background: var(--fa-hero-gradient); color: #fff; }
.success-emoji { font-size: 2.2rem; }

@media (min-width: 960px) {
  .pub-title { font-size: 1rem; padding: 12px 16px 4px; }
  .pub-panel :deep(.v-card-text) { padding: 8px 12px; }
  .pub-list { gap: 8px !important; }
  .pub-row { padding: 8px !important; gap: 4px !important; }
  .pub-row :deep(.v-selection-control) { --v-selection-control-size: 32px; }
  .geo-toggle { height: 32px !important; max-width: 100%; }
  .geo-toggle :deep(.v-btn) { padding: 0 8px; font-size: 0.72rem; letter-spacing: 0; }
  .geo-toggle :deep(.v-btn .v-btn__prepend) { margin-inline-end: 4px; margin-inline-start: 0; }
  .geo-toggle :deep(.v-btn .v-icon) { font-size: 14px; }
  .pub-actions { position: sticky; bottom: 0; background: rgb(var(--v-theme-surface)); border-top: 1px solid rgba(var(--v-theme-on-surface), 0.08); padding: 10px 12px !important; z-index: 1; }
  .pub-actions .v-btn--size-x-large { min-height: 44px; font-size: 0.95rem; }
}
</style>
