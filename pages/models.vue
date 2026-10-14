<script setup lang="ts">
// Model routing editor: wire each task to models in order, with fallbacks. Each link out of a
// model is "if it fails, try this next". Saved in Dexie settings 'modelRouting'
// (utils/modelRouting.ts) and followed by the voice recorder.
import { Handle, MarkerType, Position, VueFlow, type Connection, type Edge, type Node } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import {
  canConnect, connectEdges, coolingDown, DEFAULT_COOLDOWN_MIN, edgeId, graphToRouting, MODELS, parseNodeId,
  routingToGraph, TASKS, type GraphNode, type ModelId, type RouteStep, type Routing, type TaskId,
} from '~/utils/modelRouting'
import { webSpeechSupported } from '~/composables/useWebSpeech'

const { routing, loaded, cooldowns, load, save, reset } = useModelRouting()
const { isCached: whisperCached, model: whisperModel } = useWhisper()

type FlowNode = Node<GraphNode['data']>
const nodes = ref<FlowNode[]>([])
const edges = ref<Edge[]>([])
const selected = ref<{ kind: 'node' | 'edge'; id: string } | null>(null)
const savedAt = ref(0)
const hint = ref('')
const online = ref(true)

const makeEdge = (source: string, target: string, label?: string): Edge => ({
  id: edgeId(source, target), source, target, label,
  markerEnd: MarkerType.ArrowClosed,
  animated: label === 'first',
  class: label === 'first' ? 'edge-first' : 'edge-fallback',
})

// Phones get routes running top to bottom so the boxes stay readable.
const tall = ref(false)
const srcPos = computed(() => (tall.value ? Position.Bottom : Position.Right))
const tgtPos = computed(() => (tall.value ? Position.Top : Position.Left))

function buildFrom(r: Routing) {
  const g = routingToGraph(r, tall.value)
  nodes.value = g.nodes.map((n) => ({ ...n, deletable: false }))
  edges.value = g.edges.map((e) => makeEdge(e.source, e.target, e.label))
}

/** Read the route back out of the graph, save it, and relabel the links. */
async function commit() {
  const r = graphToRouting(nodes.value as GraphNode[], edges.value, tall.value, routing.value)
  await save(r)
  edges.value = routingToGraph(r, tall.value).edges.map((e) => makeEdge(e.source, e.target, e.label))
  savedAt.value = Date.now()
}

onMounted(async () => {
  online.value = navigator.onLine
  tall.value = window.matchMedia('(max-width: 599px)').matches
  await load()
  buildFrom(routing.value)
})

const inRoute = computed(() => {
  const s = new Set<string>()
  for (const t of TASKS) for (const step of routing.value.routes[t.id]) s.add(`${t.id}:${step.model}`)
  return s
})

function modelStatus(m: ModelId): { text: string; color: string } {
  if (coolingDown(cooldowns, m)) {
    const until = new Date(cooldowns.get(m)!).toLocaleTimeString([], { timeStyle: 'short' })
    return { text: `Resting until ${until}`, color: 'warning' }
  }
  switch (m) {
    case 'whisper': return whisperCached.value ? { text: `Downloaded (${whisperModel.value})`, color: 'success' } : { text: 'Not downloaded', color: 'warning' }
    case 'web-speech':
      if (!webSpeechSupported()) return { text: 'Not in this browser', color: 'error' }
      return online.value ? { text: 'Online', color: 'success' } : { text: 'Offline now', color: 'warning' }
    default: return { text: 'Always works', color: 'success' }
  }
}

function isValidConnection(c: Connection) {
  return !canConnect(c.source, c.target, edges.value)
}

function onConnect(c: Connection) {
  const why = canConnect(c.source, c.target, edges.value)
  if (why) { hint.value = why; return }
  hint.value = ''
  edges.value = connectEdges(edges.value, c.source, c.target, (s, t) => makeEdge(s, t))
  commit()
}

// Links removed with Backspace/Delete come through v-model; save the new route.
function onEdgesChange(changes: { type: string }[]) {
  if (changes.some((c) => c.type === 'remove')) {
    if (selected.value?.kind === 'edge') selected.value = null
    nextTick(commit)
  }
}

function removeEdge(id: string) {
  edges.value = edges.value.filter((e) => e.id !== id)
  selected.value = null
  commit()
}

/** Take a model out of its route; the models either side of it join up. */
function unlinkNode(id: string) {
  const into = edges.value.find((e) => e.target === id)
  const out = edges.value.find((e) => e.source === id)
  let next = edges.value.filter((e) => e.source !== id && e.target !== id)
  if (into && out) next = connectEdges(next, into.source, out.target, (s, t) => makeEdge(s, t))
  edges.value = next
  commit()
}

/** Put a parked model at the end of its task's route. */
function appendNode(id: string) {
  const p = parseNodeId(id)
  if (!p?.model) return
  const chain = routing.value.routes[p.task]
  const last = chain.length ? `${p.task}:${chain[chain.length - 1].model}` : `task:${p.task}`
  edges.value = connectEdges(edges.value, last, id, (s, t) => makeEdge(s, t))
  commit()
}

function onNodeDragStop() {
  commit()
}

const selNode = computed(() => (selected.value?.kind === 'node' ? nodes.value.find((n) => n.id === selected.value!.id) : undefined))
const selModel = computed(() => (selNode.value?.data.model ? MODELS[selNode.value.data.model] : undefined))
const selTask = computed(() => TASKS.find((t) => t.id === selNode.value?.data.task))
const selEdge = computed(() => (selected.value?.kind === 'edge' ? edges.value.find((e) => e.id === selected.value!.id) : undefined))
const nodeLabel = (id: string) => {
  const p = parseNodeId(id)
  if (!p) return id
  return p.model ? MODELS[p.model].label : TASKS.find((t) => t.id === p.task)!.label
}

function setStep(field: 'timeoutSec' | 'cooldownMin', raw: string | number | null) {
  const n = selNode.value
  if (!n?.data.step) return
  const v = raw === '' || raw == null ? undefined : Number(raw)
  const step: RouteStep = { ...n.data.step }
  if (v === undefined || !Number.isFinite(v) || v <= 0) delete step[field]
  else step[field] = v
  n.data = { ...n.data, step }
  commit()
}

async function resetAll() {
  await reset()
  buildFrom(routing.value)
  selected.value = null
  savedAt.value = Date.now()
}

/** Plain-language route, under the graph. */
const summary = computed(() =>
  TASKS.map((t) => {
    const steps = routing.value.routes[t.id]
    return {
      task: t,
      text: steps.length
        ? steps.map((s, i) => (i === 0 ? MODELS[s.model].label : `if that fails, ${MODELS[s.model].label}`)).join(', ')
        : t.id === 'extract' ? 'Off: voice notes do not fill the form' : 'Nothing: voice notes cannot record',
    }
  }),
)

const showSaved = ref(false)
let savedTimer: ReturnType<typeof setTimeout> | null = null
watch(savedAt, () => {
  showSaved.value = true
  if (savedTimer) clearTimeout(savedTimer)
  savedTimer = setTimeout(() => { showSaved.value = false }, 3000)
})
onBeforeUnmount(() => { if (savedTimer) clearTimeout(savedTimer) })
</script>

<template>
  <div class="models">
    <header class="fa-hero models-hero">
      <div class="d-flex align-center ga-3">
        <v-btn icon="mdi-arrow-left" variant="text" color="white" to="/settings" aria-label="Back to Settings" />
        <div>
          <h1 class="text-h5 font-weight-bold">Model routing</h1>
          <div class="text-body-2 hero-sub">Which model does each job, and what to try when one fails</div>
        </div>
      </div>
    </header>

    <v-container class="models-body">
      <v-card class="fa-card mb-4">
        <v-card-text class="text-body-2">
          Drag from a box's outgoing dot to another box's incoming dot to link them, or tap one dot and then the other.
          A task's first link picks the model it tries first. A link out of a model says what to try next when it times out,
          hits a quota, needs a connection you don't have, or fails. Grey boxes are not in use. Tap a box or link for options.
        </v-card-text>
      </v-card>

      <v-card class="fa-card mb-4 canvas-card">
        <div class="canvas" data-testid="routing-canvas">
          <VueFlow
            v-if="loaded && nodes.length"
            v-model:nodes="nodes"
            v-model:edges="edges"
            :is-valid-connection="isValidConnection"
            :default-edge-options="{ type: 'smoothstep' }"
            :min-zoom="0.3"
            :max-zoom="1.6"
            :delete-key-code="['Backspace', 'Delete']"
            fit-view-on-init
            @connect="onConnect"
            @edges-change="onEdgesChange"
            @node-drag-stop="onNodeDragStop"
            @node-click="({ node }) => (selected = { kind: 'node', id: node.id })"
            @edge-click="({ edge }) => (selected = { kind: 'edge', id: edge.id })"
            @pane-click="selected = null"
          >
            <Background :gap="20" />
            <Controls :show-interactive="false" />

            <template #node-task="{ id, data }">
              <div class="rnode rnode-task" :class="{ 'is-selected': selected?.id === id }">
                <v-icon size="18" class="mr-1">{{ TASKS.find((t) => t.id === data.task)?.icon }}</v-icon>
                <span class="font-weight-bold">{{ TASKS.find((t) => t.id === data.task)?.label }}</span>
                <div class="text-caption rnode-sub">{{ TASKS.find((t) => t.id === data.task)?.note }}</div>
                <Handle type="source" :position="srcPos" />
              </div>
            </template>

            <template #node-model="{ id, data }">
              <div class="rnode rnode-model" :class="{ 'is-parked': !inRoute.has(id), 'is-selected': selected?.id === id }">
                <Handle type="target" :position="tgtPos" />
                <div class="d-flex align-center">
                  <v-icon size="18" class="mr-1">{{ MODELS[data.model as ModelId].icon }}</v-icon>
                  <span class="font-weight-bold">{{ MODELS[data.model as ModelId].label }}</span>
                </div>
                <div class="text-caption rnode-sub">{{ MODELS[data.model as ModelId].where === 'cloud' ? 'Online' : 'On device' }}</div>
                <v-chip size="x-small" :color="modelStatus(data.model as ModelId).color" variant="tonal" class="mt-1">
                  {{ modelStatus(data.model as ModelId).text }}
                </v-chip>
                <div v-if="data.step?.timeoutSec || data.step?.cooldownMin" class="text-caption rnode-sub mt-1">
                  <span v-if="data.step?.timeoutSec">Timeout {{ data.step.timeoutSec }} s</span>
                  <span v-if="data.step?.timeoutSec && data.step?.cooldownMin"> · </span>
                  <span v-if="data.step?.cooldownMin">Rest {{ data.step.cooldownMin }} min</span>
                </div>
                <Handle type="source" :position="srcPos" />
              </div>
            </template>
          </VueFlow>
        </div>
        <v-alert v-if="hint" type="warning" variant="tonal" density="compact" class="ma-3" closable @click:close="hint = ''">{{ hint }}</v-alert>
      </v-card>

      <v-card v-if="selNode" class="fa-card mb-4" data-testid="node-panel">
        <v-card-title class="text-subtitle-1 font-weight-bold">{{ selModel?.label ?? selTask?.label }}</v-card-title>
        <v-card-text>
          <template v-if="selModel">
            <p class="text-body-2 mb-3">{{ selModel.note }}</p>
            <template v-if="inRoute.has(selNode.id)">
              <v-text-field
                :model-value="selNode.data.step?.timeoutSec ?? ''"
                type="number"
                min="1"
                label="Timeout (seconds)"
                hint="Move on to the next model after this long. Used when transcribing a saved recording. Empty means wait."
                persistent-hint
                variant="outlined"
                density="comfortable"
                class="mb-3"
                @change="(e: Event) => setStep('timeoutSec', (e.target as HTMLInputElement).value)"
              />
              <v-text-field
                v-if="selModel.where === 'cloud'"
                :model-value="selNode.data.step?.cooldownMin ?? ''"
                type="number"
                min="1"
                label="Rest after a quota error (minutes)"
                :hint="`Skip this model for a while after it says it hit a limit. Empty means ${DEFAULT_COOLDOWN_MIN} minutes.`"
                persistent-hint
                variant="outlined"
                density="comfortable"
                @change="(e: Event) => setStep('cooldownMin', (e.target as HTMLInputElement).value)"
              />
            </template>
            <p v-else class="text-body-2 text-medium-emphasis">Not in use. Link it in, or add it to the end of the route.</p>
          </template>
          <p v-else class="text-body-2">{{ selTask?.note }}. Link this to the model it should try first.</p>
        </v-card-text>
        <v-card-actions v-if="selModel">
          <v-btn v-if="inRoute.has(selNode.id)" variant="text" color="error" prepend-icon="mdi-link-variant-off" @click="unlinkNode(selNode.id)">Take out of route</v-btn>
          <v-btn v-else variant="tonal" color="primary" prepend-icon="mdi-plus" @click="appendNode(selNode.id)">Add to end of route</v-btn>
        </v-card-actions>
      </v-card>

      <v-card v-if="selEdge" class="fa-card mb-4" data-testid="edge-panel">
        <v-card-text class="d-flex align-center ga-2 flex-wrap">
          <span class="text-body-2 flex-grow-1">
            {{ nodeLabel(selEdge.source) }} <v-icon size="16">mdi-arrow-right</v-icon> {{ nodeLabel(selEdge.target) }}
          </span>
          <v-btn variant="text" color="error" prepend-icon="mdi-link-variant-off" @click="removeEdge(selEdge.id)">Remove link</v-btn>
        </v-card-text>
      </v-card>

      <v-card class="fa-card mb-4">
        <v-card-title class="text-subtitle-1 font-weight-bold d-flex align-center">
          Current routing
          <v-spacer />
          <v-fade-transition><v-chip v-if="showSaved" size="small" color="success" variant="tonal" prepend-icon="mdi-check">Saved</v-chip></v-fade-transition>
        </v-card-title>
        <v-card-text>
          <div v-for="s in summary" :key="s.task.id" class="mb-2" :data-testid="`route-${s.task.id}`">
            <div class="text-body-2 font-weight-bold">{{ s.task.label }}</div>
            <div class="text-body-2">{{ s.text }}</div>
          </div>
          <p class="text-caption text-medium-emphasis mt-3 mb-0">
            Species ID has no model in the app yet. New models show up here as boxes when they are added.
          </p>
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" prepend-icon="mdi-restore" @click="resetAll">Reset to default</v-btn>
        </v-card-actions>
      </v-card>
    </v-container>
  </div>
</template>

<style scoped>
.models-hero { padding-bottom: 44px; }
.hero-sub { opacity: .9; }
.models-body { max-width: 1100px; }
.canvas-card { overflow: hidden; }
.canvas { height: min(62vh, 560px); min-height: 380px; }
@media (max-width: 599px) { .canvas { height: 68vh; } }
.rnode {
  position: relative;
  padding: 8px 12px;
  border-radius: 12px;
  border: 1.5px solid rgba(var(--v-border-color), .35);
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  min-width: 150px;
  max-width: 190px;
  font-size: 14px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, .12);
}
.rnode-task { background: rgb(var(--v-theme-primary)); color: rgb(var(--v-theme-on-primary)); border-color: transparent; }
.rnode-task .rnode-sub { opacity: .85; }
.rnode-sub { opacity: .7; line-height: 1.3; }
.rnode-model.is-parked { opacity: .55; border-style: dashed; }
.rnode.is-selected { outline: 3px solid rgba(var(--v-theme-primary), .5); outline-offset: 2px; }
/* Bigger handles so links can be made with a finger. */
.rnode :deep(.vue-flow__handle) { width: 14px; height: 14px; background: rgb(var(--v-theme-secondary, var(--v-theme-primary))); border: 2px solid rgb(var(--v-theme-surface)); }
.canvas :deep(.vue-flow__edge.edge-fallback .vue-flow__edge-path) { stroke-dasharray: 6 4; }
.canvas :deep(.vue-flow__edge-textbg) { fill: rgb(var(--v-theme-surface)); }
.canvas :deep(.vue-flow__edge-text) { fill: rgb(var(--v-theme-on-surface)); font-size: 11px; }
.canvas :deep(.vue-flow__node) { cursor: grab; }
</style>
