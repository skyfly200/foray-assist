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
            @focus="onFocus(f.key)"
            @blur="editing = null; flush()"
            @keydown="f.key === 'speciesGuess' && onSpeciesKey($event)"
          />
          <v-sheet
            v-if="f.key === 'speciesGuess' && speciesHits.length"
            class="fa-species-suggest mt-1"
            border
            rounded
            role="listbox"
            aria-label="Species suggestions"
          >
            <v-list density="compact" class="py-0" bg-color="transparent">
              <v-list-item
                v-for="(s, i) in speciesHits"
                :key="s.name"
                :active="i === hiIndex"
                role="option"
                @pointerdown.prevent
                @mousedown.prevent
                @click="pickSpecies(s.name)"
              >
                <v-list-item-title class="font-italic">{{ s.name }}</v-list-item-title>
                <v-list-item-subtitle v-if="s.common || s.source !== 'list'">
                  <span v-if="s.common">{{ s.common }}</span>
                  <span v-if="s.common && s.source !== 'list'"> · </span>
                  <span v-if="s.source === 'past'">your finds{{ s.count && s.count > 1 ? ` ×${s.count}` : '' }}</span>
                  <span v-else-if="s.source === 'custom'">your word list</span>
                </v-list-item-subtitle>
                <template #prepend>
                  <v-icon :icon="s.source === 'past' ? 'mdi-history' : s.source === 'custom' ? 'mdi-account-star' : 'mdi-mushroom'" size="18" />
                </template>
              </v-list-item>
            </v-list>
          </v-sheet>
          <v-btn
            v-if="f.key === 'speciesGuess'"
            class="mt-2"
            size="small"
            variant="tonal"
            color="primary"
            prepend-icon="mdi-file-tree-outline"
            @click="keyOpen = true"
          >
            Not sure? Narrow it down
          </v-btn>
          <IdKeyDialog v-if="f.key === 'speciesGuess'" v-model="keyOpen" :notes="local" @pick="applyPatch" />
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
          @focus="onFocus('notes')"
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
import { useSpeciesSuggest } from '~/composables/useSpeciesSuggest'

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

// Species autocomplete: the user's past names, their word list, then the built-in list.
const species = useSpeciesSuggest()
const speciesTyped = ref(false)
const hiIndex = ref(-1)
const speciesHits = computed(() =>
  editing.value === 'speciesGuess' && speciesTyped.value ? species.suggest(local.speciesGuess ?? '') : [],
)
watch(speciesHits, () => { hiIndex.value = -1 })

function onFocus(key: Key) {
  editing.value = key
  if (key === 'speciesGuess') {
    speciesTyped.value = false
    void species.refresh(props.specimenRowId)
  }
}

function pickSpecies(name: string) {
  local.speciesGuess = name
  queue('speciesGuess')
  flush()
  speciesTyped.value = false
}

function onSpeciesKey(e: KeyboardEvent) {
  const n = speciesHits.value.length
  if (e.key === 'Escape') speciesTyped.value = false
  if (!n) return
  if (e.key === 'ArrowDown') { hiIndex.value = (hiIndex.value + 1) % n; e.preventDefault() }
  else if (e.key === 'ArrowUp') { hiIndex.value = (hiIndex.value - 1 + n) % n; e.preventDefault() }
  else if ((e.key === 'Enter' || e.key === 'Tab') && hiIndex.value >= 0) {
    pickSpecies(speciesHits.value[hiIndex.value].name)
    e.preventDefault()
  }
}

function queue(key: Key) {
  if (key === 'speciesGuess' && editing.value === 'speciesGuess') speciesTyped.value = true
  pending[key] = (local[key] ?? '') as string
  if (timer) clearTimeout(timer)
  timer = setTimeout(flush, 500)
}

// The ID key fills the species guess (and empty fields it learned) in one go.
const keyOpen = ref(false)
function applyPatch(patch: FieldNotes) {
  for (const [k, v] of Object.entries(patch) as [Key, string][]) {
    local[k] = v
    pending[k] = v
  }
  flush()
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
.fa-species-suggest { max-height: 264px; overflow-y: auto; }
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
