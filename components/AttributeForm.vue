<template>
  <v-expansion-panels v-model="open" multiple variant="accordion" class="attr-sections">
    <v-expansion-panel v-for="g in groups" :key="g.id" :value="g.id" elevation="0">
      <v-expansion-panel-title>
        <span class="mr-2" aria-hidden="true">{{ g.emoji }}</span>
        <v-icon :icon="g.icon" class="mr-2" color="primary" size="20" />
        {{ g.title }}
        <v-chip v-if="filled(g)" size="x-small" color="primary" variant="flat" class="ml-2">{{ filled(g) }}</v-chip>
      </v-expansion-panel-title>
      <v-expansion-panel-text>
        <div v-for="f in g.fields" :key="f.key" class="mb-3">
          <v-text-field
            v-model="local[f.key]"
            :label="f.label"
            density="comfortable"
            hide-details
            clearable
            @update:model-value="queue(f.key)"
            @blur="flush"
          />
          <v-chip-group v-if="f.options" column class="mt-1">
            <v-chip
              v-for="o in f.options"
              :key="o"
              class="fa-pill"
              color="primary"
              filter
              :model-value="local[f.key] === o"
              @click="pick(f.key, o)"
            >
              {{ o }}
            </v-chip>
          </v-chip-group>
        </div>
        <v-textarea
          v-if="g.id === 'notes'"
          v-model="local.notes"
          label="Notes"
          rows="2"
          auto-grow
          hide-details
          @update:model-value="queue('notes')"
          @blur="flush"
        />
      </v-expansion-panel-text>
    </v-expansion-panel>
  </v-expansion-panels>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
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

type Field = (typeof fields)[number]
const byKey = (...keys: Key[]): Field[] => keys.map((k) => fields.find((f) => f.key === k)!)
const groups = [
  { id: 'id', title: 'What is it?', emoji: '🍄', icon: 'mdi-magnify', fields: byKey('speciesGuess') },
  { id: 'habitat', title: 'Where it grows', emoji: '🌲', icon: 'mdi-tree', fields: byKey('substrate', 'hostTree') },
  { id: 'feel', title: 'Look and feel', emoji: '✋', icon: 'mdi-hand-back-right', fields: byKey('capTexture', 'staining') },
  { id: 'smell', title: 'Smell', emoji: '👃', icon: 'mdi-flower', fields: byKey('odor') },
  { id: 'notes', title: 'Notes', emoji: '📝', icon: 'mdi-note-text', fields: [] as Field[] },
]
const open = ref<string[]>(['id'])
const filled = (g: { id: string; fields: Field[] }) =>
  g.id === 'notes' ? (local.notes ? 1 : 0) : g.fields.filter((f) => local[f.key]).length

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

<style scoped>
.attr-sections { display: flex; flex-direction: column; gap: 8px; }
.attr-sections :deep(.v-expansion-panel) { background: rgba(var(--v-theme-primary), 0.06); border-radius: var(--fa-radius-sm) !important; }
.attr-sections :deep(.v-expansion-panel::after) { display: none; }
</style>
