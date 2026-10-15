<script setup lang="ts">
import { useDb } from '~/utils/db'
const props = defineProps<{ forayId: string }>()
const { online, signedIn } = useSync()
const g = useGooglePhotos()
const limit = ref(false)
const hasEnd = ref(false)
const summary = ref('')

onMounted(async () => {
  try { hasEnd.value = !!(await useDb().forays.get(props.forayId))?.endedAt } catch { /* ignore */ }
  if (signedIn.value && online.value) g.refreshStatus()
})
watch([signedIn, online], ([s, o]) => { if (s && o) g.refreshStatus() })

const disabledReason = computed(() =>
  !online.value ? 'Offline: Google Photos import needs internet.'
  : !signedIn.value ? 'Sign in on the Settings page to use Google Photos.'
  : g.status.value && !g.connected.value ? 'Connect Google Photos on the Settings page first.' : '')

async function start() {
  summary.value = ''
  const r = await g.pickAndImport(props.forayId, { limitToForayWindow: limit.value })
  if (r) summary.value = `Imported ${r.imported}` + (r.duplicates ? `, ${r.duplicates} already imported` : '') + (r.outsideWindow ? `, ${r.outsideWindow} outside foray time` : '') + (r.failed ? `, ${r.failed} failed` : '') + '.'
}
</script>

<template>
  <div class="gp-import">
    <v-btn color="white" class="text-primary" size="large" prepend-icon="mdi-google" :disabled="!!disabledReason || g.busy.value" :loading="g.busy.value" @click="start">
      Google Photos
    </v-btn>
    <v-checkbox v-if="hasEnd && !disabledReason" v-model="limit" class="w-100 gp-limit" density="compact" hide-details label="Only Google photos taken during this foray" />
    <p v-if="disabledReason" class="text-caption w-100 gp-reason">{{ disabledReason }}</p>
    <transition name="gp">
      <v-card v-if="g.phase.value === 'waiting'" variant="flat" color="surface" class="mt-2 pa-3 text-body-2 w-100">
        Choose photos in the Google tab, then come back here.
        <div class="mt-1">
          <a v-if="g.pickerUrl.value" :href="g.pickerUrl.value" target="_blank" rel="noopener">Open picker</a>
          <v-btn size="small" variant="text" @click="g.cancel()">Cancel</v-btn>
        </div>
      </v-card>
    </transition>
    <transition name="gp">
      <v-card v-if="g.phase.value === 'downloading'" variant="flat" color="surface" class="mt-2 pa-3 text-body-2 w-100">
        Downloading {{ g.progress.value.done }} / {{ g.progress.value.total }}
        <v-progress-linear class="mt-2 w-100" rounded color="primary" height="8" :model-value="g.progress.value.total ? (g.progress.value.done / g.progress.value.total) * 100 : 0" />
      </v-card>
    </transition>
    <transition name="gp">
      <v-alert v-if="g.error.value" type="error" variant="flat" density="compact" class="mt-2 w-100">{{ g.error.value }}</v-alert>
    </transition>
    <transition name="gp">
      <v-alert v-if="summary" color="surface" variant="flat" density="compact" class="mt-2 w-100" icon="mdi-check-circle-outline">{{ summary }}</v-alert>
    </transition>
  </div>
</template>

<style scoped>
.gp-import { display: contents; }
.gp-reason { margin: -4px 0 0; opacity: .85; }
.gp-limit { margin-top: -8px; }
.gp-enter-active { animation: fa-pop .35s var(--fa-ease); }
.gp-leave-active { transition: opacity .2s; }
.gp-leave-to { opacity: 0; }
</style>
