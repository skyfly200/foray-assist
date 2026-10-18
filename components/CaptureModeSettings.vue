<template>
  <v-card class="fa-card">
    <v-card-title class="text-subtitle-1 font-weight-bold">New find button</v-card-title>
    <v-card-text>
      <v-radio-group :model-value="mode" hide-details data-testid="capture-mode" @update:model-value="(v: any) => setMode(v)">
        <v-radio value="guided">
          <template #label>
            <div>
              <div>Guided capture <v-chip size="x-small" class="ml-1">default</v-chip></div>
              <div class="text-caption text-medium-emphasis">{{ guidedNote }}</div>
            </div>
          </template>
        </v-radio>
        <v-radio value="photo">
          <template #label>
            <div>
              <div>Quick photo</div>
              <div class="text-caption text-medium-emphasis">Opens your camera app. The photo becomes a new find.</div>
            </div>
          </template>
        </v-radio>
      </v-radio-group>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useCaptureMode } from '~/composables/useCaptureMode'
import { arSupported } from '~/composables/useXr'

const { mode, setMode } = useCaptureMode()
const ar = ref<boolean | null>(null)
onMounted(async () => { ar.value = await arSupported() })
const guidedNote = computed(() =>
  ar.value === false
    ? 'Starts a find and walks you through each shot with the camera. AR isn\'t available in this browser (it needs Chrome on Android with Google Play Services for AR).'
    : 'Starts a find and opens AR with shot markers around the mushroom, live captions and pinned notes. Uses the guided camera where AR isn\'t available.',
)
</script>
