<script setup lang="ts">
// Foray detail. Foray Mode: log finds in the field (photos, voice, notes, labels).
// Review Mode: import/group photos, curate, and publish to iNaturalist.
import { liveQuery } from 'dexie'

const route = useRoute()
const id = route.params.id as string
const { isForay } = useMode()

const foray = ref<Foray | null | undefined>(undefined)
let sub: { unsubscribe(): void } | null = null

onMounted(() => {
  sub = liveQuery(() => useDb().forays.get(id)).subscribe({ next: (r) => (foray.value = r ?? null) })
})
onBeforeUnmount(() => sub?.unsubscribe())
</script>

<template>
  <div v-if="foray === null">
    <v-alert type="warning" variant="tonal" class="mb-4">Foray not found.</v-alert>
    <v-btn to="/" prepend-icon="mdi-arrow-left">Back to forays</v-btn>
  </div>
  <template v-else>
    <div class="mb-4">
      <div class="text-h5">{{ foray?.name }}</div>
      <div v-if="foray" class="text-medium-emphasis">
        Started {{ new Date(foray.startedAt).toLocaleString() }}
        <span v-if="foray.endedAt"> · ended {{ new Date(foray.endedAt).toLocaleString() }}</span>
      </div>
    </div>

    <template v-if="isForay">
      <VoiceRecorder :foray-id="id" class="mb-4" />
      <FindList :foray-id="id" />
    </template>
    <template v-else>
      <ReviewPanel :foray-id="id">
        <template #sources>
          <GooglePhotosImport :foray-id="id" />
        </template>
      </ReviewPanel>
      <v-divider class="my-4" />
      <PublishPanel :foray-id="id" />
    </template>
  </template>
</template>
