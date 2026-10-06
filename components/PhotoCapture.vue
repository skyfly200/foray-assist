<template>
  <div class="photo-capture d-flex align-center ga-2">
    <div class="flex-grow-1">
      <v-btn
        block
        size="large"
        color="primary"
        class="take"
        prepend-icon="mdi-camera"
        :loading="busy"
        @click="cameraInput?.click()"
      >
        Take photo
      </v-btn>
    </div>
    <v-btn size="large" color="primary" variant="tonal" icon="mdi-image-multiple" :disabled="busy" aria-label="Pick photos from gallery" @click="pickerInput?.click()" />
    <!-- Browser capture does not guarantee EXIF; addPhoto stamps time + GPS itself. -->
    <input ref="cameraInput" type="file" accept="image/*" capture="environment" hidden @change="onFiles($event, 'capture')" />
    <input ref="pickerInput" type="file" accept="image/*" multiple hidden @change="onFiles($event, 'picker')" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { addPhoto } from '~/composables/useFinds'

const props = defineProps<{ specimenRowId: string; forayId: string }>()
const cameraInput = ref<HTMLInputElement | null>(null)
const pickerInput = ref<HTMLInputElement | null>(null)
const busy = ref(false)

async function onFiles(e: Event, source: 'capture' | 'picker') {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = '' // allow re-selecting the same file
  if (!files.length) return
  busy.value = true
  try {
    for (const f of files) await addPhoto(props.specimenRowId, props.forayId, f, source)
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.take { min-height: 56px; font-size: 1.05rem; }
@media (min-width: 960px) { .take { min-height: 44px; font-size: 0.95rem; } }
</style>
