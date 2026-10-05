<script setup lang="ts">
import { liveQuery } from 'dexie'
import type { Geoprivacy } from '~/utils/db'
const props = defineProps<{ forayId: string }>()
const { connected, signedIn, online, queue, retry, setGeoprivacy, observationUrl } = usePublish()

interface Row { id: string; label: string; guess: string; photos: number; geoprivacy: Geoprivacy; status: string; error?: string; obsId?: number }
const rows = ref<Row[]>([])
const checked = ref<string[]>([])
let sub: any

onMounted(() => {
  sub = liveQuery(async () => {
    const db = useDb()
    const specs = await db.specimens.where('forayId').equals(props.forayId).sortBy('timestamp')
    const photos = await db.photos.where('forayId').equals(props.forayId).toArray()
    return specs.map((s): Row => ({
      id: s.id, label: s.specimenId, guess: s.fieldNotes?.speciesGuess ?? '', geoprivacy: s.geoprivacy,
      photos: photos.filter((p) => p.specimenRowId === s.id && p.isSelected).length,
      status: s.inatStatus ?? 'draft', error: s.inatError, obsId: s.iNatObservationId,
    }))
  }).subscribe({ next: (r) => (rows.value = r), error: () => {} })
})
onBeforeUnmount(() => sub?.unsubscribe())

const eligible = (r: Row) => r.status === 'draft' || r.status === 'failed'
const selectable = computed(() => rows.value.filter(eligible))
const ready = computed(() => signedIn.value && connected.value)
const colors: Record<string, string> = { draft: 'grey', queued: 'info', published: 'success', failed: 'error' }
const geoOptions = [{ title: 'Open', value: 'open' }, { title: 'Obscured', value: 'obscured' }, { title: 'Private', value: 'private' }]

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
  <v-card variant="tonal">
    <v-card-title>Publish to iNaturalist</v-card-title>
    <v-card-text>
      <v-alert v-if="!ready" type="info" variant="text" density="compact" class="mb-2">
        {{ !signedIn ? 'Sign in and connect iNaturalist in Settings.' : 'Connect iNaturalist in Settings.' }}
        You can still queue finds; they publish once connected and online.
      </v-alert>
      <v-alert v-else-if="!online" type="info" variant="text" density="compact" class="mb-2">
        Offline: queued finds publish when you reconnect.
      </v-alert>
      <div v-if="!rows.length" class="text-body-2">No finds in this foray yet.</div>
      <v-list v-else lines="three" density="compact">
        <v-list-item v-for="r in rows" :key="r.id">
          <template #prepend>
            <v-checkbox-btn v-model="checked" :value="r.id" :disabled="!eligible(r)" :aria-label="`Select ${r.label}`" />
          </template>
          <v-list-item-title>{{ r.label }} <span v-if="r.guess" class="text-medium-emphasis">· {{ r.guess }}</span></v-list-item-title>
          <v-list-item-subtitle>
            {{ r.photos }} selected photo{{ r.photos === 1 ? '' : 's' }}
            <span v-if="r.status === 'failed' && r.error" class="text-error"> · {{ r.error }}</span>
          </v-list-item-subtitle>
          <div class="d-flex align-center flex-wrap ga-2 mt-1">
            <v-chip size="small" :color="colors[r.status]" label>{{ r.status }}</v-chip>
            <v-select :model-value="r.geoprivacy" :items="geoOptions" density="compact" hide-details variant="outlined"
              style="max-width: 150px" label="Location" :disabled="r.status === 'published' || r.status === 'queued'"
              @update:model-value="(v: Geoprivacy) => setGeoprivacy(r.id, v)" />
            <v-btn v-if="r.status === 'failed'" size="small" variant="text" @click="retry(r.id)">Retry</v-btn>
            <a v-if="r.obsId" :href="observationUrl(r.obsId)" target="_blank" rel="noopener" class="text-body-2">View on iNaturalist</a>
          </div>
        </v-list-item>
      </v-list>
    </v-card-text>
    <v-card-actions>
      <v-btn color="primary" :disabled="!checked.length" @click="publishSelected">Publish selected ({{ checked.length }})</v-btn>
      <v-btn variant="text" :disabled="!selectable.length" @click="checked = selectable.map((r) => r.id)">Select all</v-btn>
    </v-card-actions>
  </v-card>
</template>
