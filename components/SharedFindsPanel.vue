<template>
  <section class="shared-panel" aria-label="Everyone's finds">
    <div class="d-flex align-center flex-wrap ga-2 mb-3">
      <h2 class="text-h6 font-weight-bold">{{ foray?.shared ? "Everyone's finds" : 'Finds shared with you' }}</h2>
      <v-chip v-if="peers.length" size="small" variant="tonal">{{ peers.length }}</v-chip>
      <v-spacer />
      <v-btn v-if="foray?.shared" size="small" variant="text" prepend-icon="mdi-refresh" :loading="refreshing" @click="refresh">Refresh</v-btn>
      <v-btn size="small" variant="tonal" prepend-icon="mdi-file-download-outline" @click="fileInput?.click()">Open a shared find</v-btn>
      <input ref="fileInput" type="file" :accept="FIND_FILE_ACCEPT" hidden @change="onFile" />
    </div>

    <v-alert v-if="pollError && foray?.shared" type="info" variant="tonal" density="compact" class="mb-3">
      Showing the last copy on this device. {{ pollError }}
    </v-alert>
    <div v-if="foray?.shared?.refreshedAt" class="text-caption text-medium-emphasis mb-2">
      Updated {{ new Date(foray.shared.refreshedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }}
    </div>

    <div v-if="!peers.length" class="text-medium-emphasis text-body-2 mb-2">
      {{ foray?.shared ? 'No finds from other members yet. They appear here when members have a connection.' : "Finds people send you as a file show up here." }}
    </div>
    <div class="peer-grid">
      <PeerFindCard v-for="p in peers" :key="p.id" :find="p" />
    </div>

    <v-dialog v-model="previewOpen" max-width="460">
      <v-card v-if="preview" class="fa-card" title="Add this find?">
        <v-card-text>
          <div class="d-flex ga-2 mb-2 flex-wrap">
            <img v-for="(u, i) in preview.photoUrls" :key="i" :src="u" alt="" class="pv-photo" />
          </div>
          <div><b>{{ preview.senderName }}</b> · {{ preview.pkg.record.specimenId ? displayId(preview.pkg.record.specimenId) : 'ID pending' }}</div>
          <div v-if="preview.pkg.record.fieldNotes.speciesGuess" class="font-italic">{{ preview.pkg.record.fieldNotes.speciesGuess }}</div>
          <div class="text-caption text-medium-emphasis">
            {{ new Date(preview.pkg.record.timestamp).toLocaleString() }} · {{ preview.pkg.photos.length }} photo{{ preview.pkg.photos.length === 1 ? '' : 's' }}
            · {{ preview.pkg.voiceNotes.length }} voice note{{ preview.pkg.voiceNotes.length === 1 ? '' : 's' }}
          </div>
          <v-alert :type="preview.verified ? 'success' : 'warning'" variant="tonal" density="compact" class="mt-3">
            {{ preview.verified ? `Signed by ${preview.senderName}'s device (a member of this foray).` : "Can't confirm who sent this: the sender isn't a member of this foray, or their device isn't known yet. Only add it if you trust where it came from." }}
          </v-alert>
          <v-alert v-if="!preview.ok" type="error" variant="tonal" density="compact" class="mt-2">{{ preview.reason }}</v-alert>
          <div v-else class="text-caption mt-2">
            It's added as {{ preview.senderName }}'s find. Your own finds are never changed.{{ preview.replace ? ' It replaces an older copy you already have.' : '' }}
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="previewOpen = false">Cancel</v-btn>
          <v-btn color="primary" variant="flat" :disabled="!preview.ok" :loading="adding" @click="onAccept">Add find</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <v-snackbar v-model="snack" :timeout="4000">{{ snackText }}</v-snackbar>
  </section>
</template>

<script setup lang="ts">
import type { Foray, PeerFindRow } from '~/utils/db'
import { displayId } from '~/utils/idCode'
import { useLiveQuery } from '~/composables/useFinds'
import { useSharedForayPolling } from '~/composables/useSharedForay'
import { acceptFindFile, FIND_FILE_ACCEPT, previewFindFile, type ImportPreview } from '~/composables/useFindShare'

const props = defineProps<{ forayId: string; foray: Foray | null | undefined }>()
const peers = useLiveQuery<PeerFindRow[]>(
  async () => (await useDb().peerFinds.where('forayId').equals(props.forayId).toArray()).sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
  [],
)
const { error: pollError, refreshing, refresh } = useSharedForayPolling(props.forayId, () => !!props.foray?.shared)

const fileInput = ref<HTMLInputElement | null>(null)
const preview = ref<ImportPreview | null>(null)
const previewOpen = ref(false)
const adding = ref(false)
const snack = ref(false)
const snackText = ref('')

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !props.foray) return
  try {
    preview.value = await previewFindFile(file, props.foray)
    previewOpen.value = true
  } catch (err: any) {
    snackText.value = err?.message ?? String(err)
    snack.value = true
  }
}

async function onAccept() {
  if (!preview.value) return
  adding.value = true
  try {
    await acceptFindFile(preview.value, props.forayId)
    previewOpen.value = false
    snackText.value = 'Find added'
    snack.value = true
  } catch (err: any) {
    snackText.value = err?.message ?? String(err)
    snack.value = true
  } finally {
    adding.value = false
  }
}
</script>

<style scoped>
.peer-grid { display: grid; gap: 16px; grid-template-columns: 1fr; }
@media (min-width: 960px) { .peer-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.pv-photo { width: 96px; height: 96px; object-fit: cover; border-radius: 12px; }
</style>
