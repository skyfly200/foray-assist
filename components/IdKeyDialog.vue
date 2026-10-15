<template>
  <v-dialog v-model="open" :fullscreen="smAndDown" max-width="600" scrollable>
    <v-card class="id-key">
      <v-toolbar color="transparent" density="comfortable">
        <v-toolbar-title class="text-subtitle-1 font-weight-bold">Narrow it down</v-toolbar-title>
        <v-btn icon="mdi-close" aria-label="Close" @click="open = false" />
      </v-toolbar>

      <v-card-text class="pt-0">
        <div class="d-flex align-center flex-wrap ga-2 mb-3" role="status" aria-live="polite">
          <span class="text-body-2"><b>{{ running.length }}</b> of {{ total }} species fit</span>
          <v-spacer />
          <v-btn v-if="history.length" size="small" variant="text" prepend-icon="mdi-undo" @click="undo">Back</v-btn>
          <v-btn v-if="anyAnswered" size="small" variant="text" prepend-icon="mdi-restart" @click="restart">Start over</v-btn>
        </div>

        <v-sheet v-if="question" class="question pa-4 mb-4" rounded="lg" border>
          <div class="text-subtitle-1 font-weight-medium">{{ question.title }}</div>
          <div v-if="question.help" class="text-caption text-medium-emphasis mt-1">{{ question.help }}</div>
          <div class="options mt-3" :class="{ wide: question.options.some((o) => o.hint) }">
            <v-btn
              v-for="o in question.options"
              :key="o.id"
              variant="tonal"
              color="primary"
              class="opt"
              :class="{ tall: o.hint }"
              @click="answer(question.id, o.id)"
            >
              <span class="opt-text">
                <span class="opt-label">{{ o.label }}</span>
                <span v-if="o.hint" class="opt-hint">{{ o.hint }}</span>
              </span>
            </v-btn>
          </div>
          <v-btn class="mt-2" variant="text" size="small" @click="answer(question.id, UNSURE)">Not sure, skip</v-btn>
        </v-sheet>
        <v-alert v-else class="mb-4" type="info" variant="tonal" density="compact">
          {{ running.length ? 'No more questions would narrow this down. Compare the matches below.' : 'Nothing fits every answer. The closest matches are below; try changing an answer.' }}
        </v-alert>

        <div v-if="answeredList.length" class="mb-4">
          <div class="text-caption text-medium-emphasis mb-1">Your answers (tap to clear)</div>
          <div class="d-flex flex-wrap ga-1">
            <v-chip
              v-for="a in answeredList"
              :key="a.id"
              size="small"
              closable
              :prepend-icon="a.fromForm ? 'mdi-file-document-outline' : undefined"
              :title="a.fromForm ? 'From the field form' : undefined"
              @click:close="clear(a.id)"
              @click="clear(a.id)"
            >
              {{ a.short }}: {{ a.value }}
            </v-chip>
          </div>
        </div>

        <div class="text-caption text-medium-emphasis mb-1">{{ running.length ? 'Best matches' : 'Closest matches' }}</div>
        <v-list density="compact" class="matches py-0" bg-color="transparent">
          <v-list-item v-for="m in shown" :key="m.species.name" class="px-2">
            <v-list-item-title>
              <span class="font-italic">{{ m.species.name }}</span>
              <v-chip v-if="m.species.danger" size="x-small" :color="m.species.danger === 'deadly' ? 'error' : 'warning'" variant="flat" class="ml-1" prepend-icon="mdi-skull-crossbones">
                {{ m.species.danger === 'deadly' ? 'Deadly' : 'Poisonous' }}
              </v-chip>
            </v-list-item-title>
            <v-list-item-subtitle>
              {{ m.species.common }}<span v-if="miss(m)"> · {{ miss(m) }}</span>
            </v-list-item-subtitle>
            <template #append>
              <v-btn size="small" variant="text" color="primary" :aria-label="`Use ${m.species.name}`" @click="use(m.species.name)">Use</v-btn>
            </template>
          </v-list-item>
        </v-list>
        <v-btn v-if="ranked.length > shown.length && !showAll" size="small" variant="text" @click="showAll = true">Show more</v-btn>

        <p class="text-caption text-medium-emphasis mt-4 mb-0">
          This key knows {{ total }} common species, so yours may not be one of them. It is a starting point for an ID,
          not a reason to eat anything.
        </p>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDisplay } from 'vuetify'
import type { FieldNotes } from '~/utils/db'
import {
  KEY_SPECIES, QUESTION, QUESTIONS, UNSURE, answersFromNotes, inRunning, nextQuestion, optionLabel, penalty, pickPatch, rankSpecies,
  type Answers, type Match, type QuestionId,
} from '~/utils/idKey'

const props = defineProps<{ notes: FieldNotes }>()
const open = defineModel<boolean>({ default: false })
const emit = defineEmits<{ pick: [patch: Partial<FieldNotes>] }>()

const { smAndDown } = useDisplay()
const total = KEY_SPECIES.length

const fromForm = ref<Answers>({})
const answers = ref<Answers>({})
const history = ref<Answers[]>([])
const showAll = ref(false)

// Start from what the field form already says each time the key opens.
watch(open, (v) => {
  if (!v) return
  fromForm.value = answersFromNotes(props.notes ?? {})
  answers.value = { ...fromForm.value }
  history.value = []
  showAll.value = false
}, { immediate: true })

const ranked = computed(() => rankSpecies(answers.value))
const running = computed(() => inRunning(ranked.value))
const question = computed(() => nextQuestion(answers.value, ranked.value))
const anyAnswered = computed(() => Object.keys(answers.value).length > 0)
const shown = computed(() => ranked.value.slice(0, showAll.value ? 40 : Math.max(5, Math.min(running.value.length, 12))))

const answeredList = computed(() =>
  QUESTIONS.filter((q) => answers.value[q.id]).map((q) => {
    const v = answers.value[q.id]!
    return { id: q.id, short: q.short, value: v === UNSURE ? 'not sure' : optionLabel(q.id, v), fromForm: fromForm.value[q.id] === v }
  }),
)

function answer(q: QuestionId, v: string) {
  history.value.push({ ...answers.value })
  answers.value = { ...answers.value, [q]: v }
}
function clear(q: QuestionId) {
  history.value.push({ ...answers.value })
  const next = { ...answers.value }
  delete next[q]
  answers.value = next
}
function undo() {
  const prev = history.value.pop()
  if (prev) answers.value = prev
}
function restart() {
  history.value.push({ ...answers.value })
  answers.value = {}
}

function miss(m: Match) {
  const parts = [...m.misses, ...m.near]
  if (!parts.length || penalty(m) === 0) return ''
  return `${m.misses.length ? "doesn't fit" : 'close on'}: ${parts.map((q) => QUESTION[q].short.toLowerCase()).join(', ')}`
}

function use(name: string) {
  emit('pick', pickPatch(name, answers.value, props.notes ?? {}))
  open.value = false
}
</script>

<style scoped>
.options { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 8px; }
.options.wide { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
.opt { height: auto !important; min-height: 44px; padding: 8px 12px; justify-content: flex-start; text-transform: none; letter-spacing: normal; }
.opt :deep(.v-btn__content) { white-space: normal; text-align: left; justify-content: flex-start; width: 100%; }
.opt-text { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
.opt-label { font-weight: 600; font-size: 0.92rem; }
.opt-hint { font-size: 0.74rem; opacity: 0.75; line-height: 1.25; }
.matches :deep(.v-list-item-subtitle) { white-space: normal; -webkit-line-clamp: unset; }
.id-key :deep(.v-card-text) { overflow-x: hidden; }
</style>
