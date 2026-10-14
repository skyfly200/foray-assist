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
            :placeholder="f.placeholder"
            :class="{ 'fa-voice-filled': flashed.has(f.key) }"
            density="comfortable"
            hide-details
            clearable
            @update:model-value="queue(f.key)"
            @focus="editing = f.key"
            @blur="editing = null; flush()"
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
          @focus="editing = 'notes'"
          @blur="editing = null; flush()"
        />
      </v-expansion-panel-text>
    </v-expansion-panel>
  </v-expansion-panels>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { updateFieldNotes } from '~/composables/useFinds'
import type { FieldNotes } from '~/utils/db'
import { formGroups, groupOf, type ResolvedGroup } from '~/utils/fieldForm'

const props = defineProps<{ specimenRowId: string; modelValue: FieldNotes }>()

type Key = keyof FieldNotes
// Which fields show is set in Settings → Field form.
const { config } = useFormConfig()
const groups = computed<ResolvedGroup[]>(() => [
  ...formGroups(config.value),
  { id: 'notes', title: 'Notes', emoji: '📝', icon: 'mdi-note-text', fields: [] },
])
const open = ref<string[]>(['id'])
const filled = (g: ResolvedGroup) =>
  g.id === 'notes' ? (local.notes ? 1 : 0) : g.fields.filter((f) => local[f.key]).length

// Initialized once from props; the form owns the text while editing (avoids cursor jumps).
const local = reactive<FieldNotes>({ ...props.modelValue })
const pending: FieldNotes = {}
let timer: ReturnType<typeof setTimeout> | null = null
const editing = ref<Key | null>(null)
// Fields just filled from a voice note, briefly highlighted.
const flashed = ref(new Set<Key>())

// Take outside changes (voice notes filling the form, sync) for fields the user is not editing.
watch(
  () => props.modelValue,
  (v) => {
    const changed: Key[] = []
    for (const k of new Set([...Object.keys(v ?? {}), ...Object.keys(local)]) as Set<Key>) {
      if (k === editing.value || k in pending) continue
      const next = v?.[k] ?? ''
      if ((local[k] ?? '') !== next) {
        local[k] = next
        changed.push(k)
      }
    }
    if (!changed.length) return
    for (const k of changed) {
      const g = k === 'notes' ? 'notes' : groupOf(k)
      if (g && !open.value.includes(g)) open.value = [...open.value, g]
    }
    flashed.value = new Set(changed)
    setTimeout(() => { flashed.value = new Set() }, 1600)
  },
  { deep: true },
)

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
.fa-voice-filled :deep(.v-field) { animation: fa-voice-flash 1.6s var(--fa-ease, ease); }
@keyframes fa-voice-flash { 0%, 40% { background: rgba(var(--v-theme-primary), 0.18); } 100% { background: transparent; } }
.attr-sections :deep(.v-expansion-panel) { background: rgba(var(--v-theme-primary), 0.06); border-radius: var(--fa-radius-sm) !important; }
.attr-sections :deep(.v-expansion-panel::after) { display: none; }
@media (min-width: 960px) {
  .attr-sections { gap: 6px; }
  .attr-sections :deep(.v-expansion-panel-title) { min-height: 44px; padding-top: 8px; padding-bottom: 8px; font-size: 0.92rem; }
  .attr-sections :deep(.v-chip-group) { padding: 0; }
  .attr-sections :deep(.v-chip) { --v-chip-height: 28px; font-size: 0.8rem; }
}
</style>
