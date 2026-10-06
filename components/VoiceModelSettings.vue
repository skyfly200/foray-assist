<template>
  <v-card class="fa-card">
    <v-card-title class="text-subtitle-1 font-weight-bold">Voice notes model</v-card-title>
    <v-card-text>
      <p class="text-body-2 text-medium-emphasis mb-3">
        Speech-to-text runs on this device with Whisper and works offline once the model is downloaded.
        Download sizes are approximate. Download over Wi-Fi when you can.
      </p>

      <v-radio-group class="model-group" :model-value="model" hide-details @update:model-value="(v: any) => setModel(v)">
        <v-radio v-for="(m, key) in models" :key="key" :value="key" :disabled="busy">
          <template #label>
            <div>
              <div>
                {{ m.label }} <span class="text-medium-emphasis">(~{{ m.approxMB }} MB)</span>
                <v-chip v-if="key === 'tiny.en'" size="x-small" class="ml-1">default</v-chip>
                <v-chip v-else size="x-small" color="primary" class="ml-1">high accuracy</v-chip>
                <v-chip v-if="cachedModels[key]" size="x-small" color="success" class="ml-1">downloaded</v-chip>
              </div>
              <div class="text-caption text-medium-emphasis">{{ m.note }}</div>
            </div>
          </template>
        </v-radio>
      </v-radio-group>

      <div class="text-body-2 mt-3" data-testid="auto-download">
        <v-icon size="small" class="mr-1">mdi-cellphone-arrow-down</v-icon>
        {{ autoText }}
      </div>

      <div class="mt-3">
        <v-progress-linear v-if="status === 'downloading'" :model-value="progress" height="8" rounded color="primary" />
        <div class="text-body-2 mt-1" :class="{ 'text-error': status === 'error' }" role="status">{{ statusText }}</div>
        <div v-if="online === false && !isCached" class="text-caption text-warning mt-1">
          You are offline. Connect to download the model.
        </div>
      </div>
    </v-card-text>
    <v-card-actions>
      <v-btn
        v-if="!isCached || status === 'error'"
        color="primary"
        variant="flat"
        prepend-icon="mdi-download"
        :loading="status === 'downloading'"
        :disabled="busy"
        @click="download"
      >
        Download voice model (~{{ models[model].approxMB }} MB)
      </v-btn>
      <v-btn v-else-if="status !== 'ready'" variant="tonal" prepend-icon="mdi-power" :loading="status === 'loading'" @click="download">
        Load model
      </v-btn>
      <v-spacer />
      <v-btn v-if="isCached" color="error" variant="text" prepend-icon="mdi-delete" :disabled="busy" @click="removeCache()">
        Remove from device
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const { model, models, status, progress, error, device, cachedModels, isCached, setModel, download, removeCache } = useWhisper()

const online = ref<boolean | null>(null)
const upd = () => (online.value = navigator.onLine)
onMounted(() => { upd(); window.addEventListener('online', upd); window.addEventListener('offline', upd) })
onBeforeUnmount(() => { window.removeEventListener('online', upd); window.removeEventListener('offline', upd) })

const auto = ref<{ at: string; status: string } | null>(null)
const saveData = ref(false)
const installed = ref(false)
onMounted(async () => {
  try { auto.value = ((await useDb().settings.get('voiceAutoDownload'))?.value as any) ?? null } catch { /* ignore */ }
  saveData.value = !!(navigator as any).connection?.saveData
  installed.value = (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) || (navigator as any).standalone === true
})
watch(status, async () => {
  try { auto.value = ((await useDb().settings.get('voiceAutoDownload'))?.value as any) ?? null } catch { /* ignore */ }
})
const autoText = computed(() => {
  if (isCached.value) return 'Downloaded. It works offline.'
  if (saveData.value) return 'Data Saver is on, so nothing downloads automatically. Use the button below.'
  if (auto.value?.status === 'failed') return 'The automatic download did not finish. It retries when you are online, or use the button below.'
  if (installed.value || auto.value?.status === 'running') return 'Downloaded automatically when you install the app. Starting soon, or use the button below.'
  return 'Downloaded automatically when you install the app. You can also download it now with the button below.'
})

const busy = computed(() => status.value === 'downloading' || status.value === 'loading')

const statusText = computed(() => {
  switch (status.value) {
    case 'downloading': return `Downloading ${progress.value}%`
    case 'loading': return 'Loading model…'
    case 'ready': return `Ready (${device.value === 'webgpu' ? 'GPU' : 'CPU'}), works offline`
    case 'cached': return 'Downloaded. Works offline.'
    case 'error': return `Error: ${error.value || 'something went wrong'}`
    case 'not-downloaded': return 'Not downloaded. Voice recordings are saved and can be transcribed later.'
    default: return 'Checking…'
  }
})
</script>

<style scoped>
@media (min-width: 960px) {
  .model-group :deep(.v-selection-control-group) { gap: 8px; }
  .model-group :deep(.v-radio) {
    border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
    border-radius: var(--fa-radius-sm);
    padding: 6px 12px;
    transition: background-color .2s var(--fa-ease), border-color .2s var(--fa-ease);
  }
  .model-group :deep(.v-radio:has(input:checked)) { border-color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), .06); }
  .model-group :deep(.v-radio .v-label) { opacity: 1; flex: 1; }
  .fa-card :deep(.v-card-text) { padding: 4px 20px 16px; }
  .fa-card :deep(.v-card-title) { padding: 18px 20px 8px; }
  .fa-card :deep(.v-card-actions) { padding: 8px 20px 18px; flex-wrap: wrap; gap: 4px; }
}
@media (min-width: 960px) and (hover: hover) {
  .model-group :deep(.v-radio:not(:has(input:disabled)):hover) { background: rgba(var(--v-theme-primary), .08); border-color: rgba(var(--v-theme-primary), .5); }
  .fa-card :deep(.v-card-actions .v-btn) { transition: transform .2s var(--fa-ease); }
  .fa-card :deep(.v-card-actions .v-btn:hover) { transform: translateY(-1px); }
}
</style>
