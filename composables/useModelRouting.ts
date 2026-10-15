// The saved model routing (utils/modelRouting.ts), shared by the editor (pages/models.vue) and
// the code that runs models (components/VoiceRecorder.vue). Module-level singleton.
import { ref } from 'vue'
import {
  defaultRouting, normalizeRouting, noteFailure, preferInRoute, ROUTING_KEY,
  type Cooldowns, type FailReason, type ModelId, type RouteStep, type Routing, type TaskId,
} from '~/utils/modelRouting'

const routing = ref<Routing>(defaultRouting())
const loaded = ref(false)
/** Models resting after a quota error (in memory: a reload gives them another try). */
const cooldowns: Cooldowns = new Map()
let loading: Promise<void> | null = null

function load(): Promise<void> {
  loading ??= (async () => {
    try {
      const db = useDb()
      const stored = (await db.settings.get(ROUTING_KEY))?.value
      if (stored) routing.value = normalizeRouting(stored)
      else if ((await db.settings.get('speechEngine'))?.value === 'browser') {
        // Chosen before the routing existed (Settings → Voice): browser speech first.
        const r = defaultRouting()
        r.routes.speech = preferInRoute(r.routes.speech, 'web-speech', 'whisper')
        routing.value = r
      }
    } catch { /* keep default */ }
    loaded.value = true
  })()
  return loading
}

async function save(r: Routing) {
  routing.value = normalizeRouting(r)
  try { await useDb().settings.put({ key: ROUTING_KEY, value: JSON.parse(JSON.stringify(routing.value)) }) } catch { /* in memory only */ }
}

async function reset() {
  await save(defaultRouting())
}

/** The ordered steps for a task, loaded from settings. */
async function routeFor(task: TaskId): Promise<RouteStep[]> {
  await load()
  return routing.value.routes[task] ?? []
}

function failed(step: RouteStep | ModelId, reason: FailReason) {
  noteFailure(cooldowns, typeof step === 'string' ? { model: step } : step, reason)
}

export function useModelRouting() {
  if (import.meta.client) load()
  return { routing, loaded, cooldowns, load, save, reset, routeFor, failed }
}
