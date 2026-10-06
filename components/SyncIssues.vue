<script setup lang="ts">
// Lists outbox items parked after repeated permanent sync failures. Renders
// nothing unless parked > 0. Discard only drops the queue entry; the data
// itself stays on this device.
import { liveQuery } from 'dexie'

const { parked, retryParked, discardParked } = useSync()
const items = ref<any[]>([])
const confirming = ref(false)
const busy = ref(false)

let sub: { unsubscribe: () => void } | null = null
onMounted(() => {
  try {
    sub = liveQuery(async () => (await useDb().outbox.toArray()).filter((i: any) => i.parkedAt)).subscribe({
      next: (rows) => (items.value = rows),
      error: () => {},
    })
  } catch { /* IndexedDB unavailable */ }
})
onBeforeUnmount(() => sub?.unsubscribe())

async function retry() {
  busy.value = true
  try { await retryParked() } finally { busy.value = false }
}
async function discard() {
  busy.value = true
  try { await discardParked() } finally { busy.value = false; confirming.value = false }
}
</script>

<template>
  <v-card v-if="parked > 0" class="fa-card mb-4" data-testid="sync-issues">
    <v-card-title class="text-subtitle-1">
      <v-icon start color="warning">mdi-alert-circle-outline</v-icon>
      {{ parked }} {{ parked === 1 ? 'item' : 'items' }} could not sync
    </v-card-title>
    <v-card-subtitle class="text-wrap">
      The server rejected these changes repeatedly. Your data is safe on this device.
    </v-card-subtitle>
    <v-list density="compact" lines="two" class="issue-list">
      <v-list-item v-for="i in items" :key="i.id" :title="`${i.table} · ${i.rowId}`" :subtitle="i.lastError || 'Unknown error'">
        <template #append><v-chip size="x-small" variant="tonal">{{ i.op }}</v-chip></template>
      </v-list-item>
    </v-list>
    <v-card-actions>
      <v-btn color="primary" variant="tonal" :loading="busy" @click="retry">Retry</v-btn>
      <v-btn color="error" variant="text" :disabled="busy" @click="confirming = true">Discard</v-btn>
    </v-card-actions>

    <v-dialog v-model="confirming" max-width="360">
      <v-card class="fa-card">
        <v-card-title>Discard {{ parked }} unsynced {{ parked === 1 ? 'change' : 'changes' }}?</v-card-title>
        <v-card-text>
          They will stop trying to sync. The records stay on this device; they just won't be uploaded unless edited again.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="confirming = false">Cancel</v-btn>
          <v-btn color="error" variant="tonal" :loading="busy" @click="discard">Discard</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<style scoped>
@media (min-width: 960px) {
  .issue-list { max-height: 320px; overflow-y: auto; }
  .fa-card :deep(.v-card-title) { padding: 16px 20px 4px; }
  .fa-card :deep(.v-card-subtitle) { padding: 0 20px 8px; }
  .fa-card :deep(.v-card-actions) { padding: 8px 20px 16px; }
}
@media (min-width: 960px) and (hover: hover) {
  .issue-list :deep(.v-list-item) { transition: background-color .2s var(--fa-ease); }
  .issue-list :deep(.v-list-item:hover) { background: rgba(var(--v-theme-primary), .06); }
}
</style>
