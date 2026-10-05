<template>
  <div>
    <div v-for="f in fields" :key="f.key" class="mb-3">
      <v-text-field
        v-model="local[f.key]"
        :label="f.label"
        density="comfortable"
        hide-details
        clearable
        @update:model-value="queue(f.key)"
        @blur="flush"
      />
      <v-chip-group v-if="f.options" column>
        <v-chip
          v-for="o in f.options"
          :key="o"
          size="small"
          filter
          :model-value="local[f.key] === o"
          @click="pick(f.key, o)"
        >
          {{ o }}
        </v-chip>
      </v-chip-group>
    </div>
    <v-textarea v-model="local.notes" label="Notes" rows="2" auto-grow hide-details @update:model-value="queue('notes')" @blur="flush" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive } from 'vue'
import { updateFieldNotes } from '~/composables/useFinds'
import type { FieldNotes } from '~/utils/db'

const props = defineProps<{ specimenRowId: string; modelValue: FieldNotes }>()

type Key = keyof FieldNotes
const fields: { key: Key; label: string; options?: string[] }[] = [
  { key: 'speciesGuess', label: 'Species guess' },
  { key: 'substrate', label: 'Substrate', options: ['decaying conifer', 'soil', 'hardwood log', 'leaf litter', 'moss', 'living tree', 'dung/wood chips'] },
  { key: 'hostTree', label: 'Host tree', options: ['oak', 'pine', 'spruce', 'fir', 'birch', 'beech', 'maple', 'aspen', 'hemlock'] },
  { key: 'odor', label: 'Odor', options: ['none', 'mild', 'farinaceous', 'anise', 'garlic', 'fishy', 'sweet', 'foul'] },
  { key: 'capTexture', label: 'Cap texture', options: ['smooth', 'slimy', 'sticky', 'scaly', 'fibrous', 'velvety', 'wrinkled'] },
  { key: 'staining', label: 'Staining', options: ['none', 'bruises blue', 'bruises red', 'bruises yellow', 'bruises brown'] },
]

// Initialized once from props; the form owns the text while editing (avoids cursor jumps).
const local = reactive<FieldNotes>({ ...props.modelValue })
const pending: FieldNotes = {}
let timer: ReturnType<typeof setTimeout> | null = null

function queue(key: Key) {
  pending[key] = (local[key] ?? '') as string
  if (timer) clearTimeout(timer)
  timer = setTimeout(flush, 500)
}

function pick(key: Key, value: string) {
  local[key] = local[key] === value ? '' : value
  queue(key)
  flush()
}

function flush() {
  if (timer) clearTimeout(timer)
  timer = null
  if (!Object.keys(pending).length) return
  const patch = { ...pending }
  for (const k of Object.keys(pending)) delete pending[k as Key]
  void updateFieldNotes(props.specimenRowId, patch)
}

// Android may background/kill the tab without blur or unmount; flush when hidden.
function onVisibility() {
  if (document.visibilityState === 'hidden') flush()
}
onMounted(() => {
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', flush)
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibility)
  window.removeEventListener('pagehide', flush)
  flush()
})
</script>
