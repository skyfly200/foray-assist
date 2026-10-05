<template>
  <div class="d-flex ga-2">
    <v-btn
      class="flex-grow-1"
      size="large"
      color="primary"
      prepend-icon="mdi-camera"
      :loading="busy"
      @click="cameraInput?.click()"
    >
      Take photo
    </v-btn>
    <v-btn size="large" variant="tonal" prepend-icon="mdi-image-multiple" :disabled="busy" @click="pickerInput?.click()">
      Pick
    </v-btn>
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
