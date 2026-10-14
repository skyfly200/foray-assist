// Model routing: which model handles each task, in order, and what to try next when one fails
// (times out, hits a quota, needs a connection we don't have, or errors).
// Edited as a node graph on /models (pages/models.vue); saved in Dexie settings 'modelRouting';
// followed by components/VoiceRecorder.vue through composables/useModelRouting.ts.
// DOM-free so tests/modelrouting.test.mjs can run it under node --experimental-strip-types.

export type TaskId = 'speech' | 'extract'
export type ModelId = 'whisper' | 'web-speech' | 'record-only' | 'word-list'
export type FailReason = 'timeout' | 'quota' | 'offline' | 'unavailable' | 'cooling' | 'error'

export interface TaskInfo {
  id: TaskId
  label: string
  icon: string
  note: string
}

export interface ModelInfo {
  id: ModelId
  label: string
  icon: string
  tasks: TaskId[]
  /** Where it runs. 'cloud' models need a connection. */
  where: 'device' | 'cloud'
  note: string
  /** Can transcribe a saved recording (Re-transcribe), not only live speech. */
  fromAudio?: boolean
}

export const TASKS: TaskInfo[] = [
  { id: 'speech', label: 'Speech to text', icon: 'mdi-microphone', note: 'Voice notes while you record' },
  { id: 'extract', label: 'Voice to form fields', icon: 'mdi-form-select', note: 'Fills the field form from what you say' },
]

export const MODELS: Record<ModelId, ModelInfo> = {
  whisper: {
    id: 'whisper', label: 'Whisper', icon: 'mdi-cellphone', tasks: ['speech'], where: 'device', fromAudio: true,
    note: 'On this device, works offline once downloaded. Size is picked under Voice notes model.',
  },
  'web-speech': {
    id: 'web-speech', label: 'Browser speech', icon: 'mdi-cloud-outline', tasks: ['speech'], where: 'cloud',
    note: "Your browser's online recognizer (Google on Chrome). Needs a connection.",
  },
  'record-only': {
    id: 'record-only', label: 'Record only', icon: 'mdi-record-rec', tasks: ['speech'], where: 'device',
    note: 'Keeps the audio with no transcript. Transcribe it later.',
  },
  'word-list': {
    id: 'word-list', label: 'Word-list parser', icon: 'mdi-format-list-text', tasks: ['extract'], where: 'device',
    note: 'Rule based, on this device, instant and offline.',
  },
}

export interface RouteStep {
  model: ModelId
  /** Give up and try the next model after this long (one-shot calls such as Re-transcribe). None by default. */
  timeoutSec?: number
  /** After a quota or rate-limit failure, skip this model for this long. */
  cooldownMin?: number
}

export type Routes = Record<TaskId, RouteStep[]>

export interface XY { x: number; y: number }

export interface Routing {
  version: 1
  routes: Routes
  /** Node positions in the editor, keyed by node id. Cosmetic only. */
  layout?: Record<string, XY>
  /** The same for the top-to-bottom layout used on phones. */
  layoutTall?: Record<string, XY>
}

export const ROUTING_KEY = 'modelRouting'
export const DEFAULT_COOLDOWN_MIN = 30

/** Today's behaviour: Whisper when downloaded, else browser speech when online, else just record. */
export function defaultRouting(): Routing {
  return {
    version: 1,
    routes: {
      speech: [{ model: 'whisper' }, { model: 'web-speech' }, { model: 'record-only' }],
      extract: [{ model: 'word-list' }],
    },
  }
}

const NUM = (v: unknown, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined

/** Accept whatever is stored and return a valid Routing (unknown models dropped, duplicates removed). */
export function normalizeRouting(raw: unknown): Routing {
  const def = defaultRouting()
  const r = raw as Partial<Routing> | null | undefined
  if (!r || typeof r !== 'object' || !r.routes || typeof r.routes !== 'object') return def
  const routes = {} as Routes
  for (const t of TASKS) {
    const list = (r.routes as any)[t.id]
    if (!Array.isArray(list)) { routes[t.id] = def.routes[t.id]; continue }
    const seen = new Set<ModelId>()
    routes[t.id] = []
    for (const s of list) {
      const m = MODELS[s?.model as ModelId]
      if (!m || !m.tasks.includes(t.id) || seen.has(m.id)) continue
      seen.add(m.id)
      const step: RouteStep = { model: m.id }
      const to = NUM(s.timeoutSec, 1, 600)
      const cd = NUM(s.cooldownMin, 0, 24 * 60)
      if (to !== undefined) step.timeoutSec = to
      if (cd !== undefined) step.cooldownMin = cd
      routes[t.id].push(step)
    }
  }
  const cleanLayout = (l: unknown) => {
    const out: Record<string, XY> = {}
    if (l && typeof l === 'object') {
      for (const [k, p] of Object.entries(l)) {
        if (p && Number.isFinite((p as XY).x) && Number.isFinite((p as XY).y)) out[k] = { x: (p as XY).x, y: (p as XY).y }
      }
    }
    return out
  }
  return { version: 1, routes, layout: cleanLayout(r.layout), layoutTall: cleanLayout(r.layoutTall) }
}

// ---------- graph <-> routes ----------
// One task node per task and one model node per (task, model) pair that the model supports.
// Models not in a route are still drawn, unlinked ("parked"), so they can be wired in.
// Links: task -> first model, then model -> the model to try if it fails. Each node has at
// most one outgoing and one incoming link, so a route is always a simple chain.

export interface GraphNode {
  id: string
  type: 'task' | 'model'
  position: XY
  data: { task: TaskId; model?: ModelId; step?: RouteStep }
}
export interface GraphEdge { id: string; source: string; target: string; label?: string }

export const taskNodeId = (t: TaskId) => `task:${t}`
export const modelNodeId = (t: TaskId, m: ModelId) => `${t}:${m}`
export function parseNodeId(id: string): { task: TaskId; model?: ModelId } | null {
  const [a, b] = id.split(':')
  if (a === 'task' && TASKS.some((t) => t.id === b)) return { task: b as TaskId }
  if (TASKS.some((t) => t.id === a) && MODELS[b as ModelId]?.tasks.includes(a as TaskId)) return { task: a as TaskId, model: b as ModelId }
  return null
}
export const edgeId = (s: string, t: string) => `e:${s}>${t}`

const COL = 230
const ROW = 260
const TALL_COL = 210
const TALL_ROW = 120

/** `tall`: routes run top to bottom, tasks side by side (phones). */
export function routingToGraph(routing: Routing, tall = false): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const lay = (tall ? routing.layoutTall : routing.layout) ?? {}
  // Default spot for the i-th box of a task's lane (0 = the task itself), `parked` below/beside the route.
  const at = (lane: number, i: number, parked = 0): XY => tall
    ? { x: lane * TALL_COL + (parked ? 20 : 0), y: i * TALL_ROW + (parked ? 30 : 0) }
    : { x: COL * i, y: lane * ROW + (parked ? 120 : 0) }
  TASKS.forEach((t, row) => {
    const tid = taskNodeId(t.id)
    nodes.push({ id: tid, type: 'task', position: lay[tid] ?? at(row, 0), data: { task: t.id } })
    const chain = routing.routes[t.id] ?? []
    let prev = tid
    chain.forEach((s, i) => {
      const id = modelNodeId(t.id, s.model)
      nodes.push({ id, type: 'model', position: lay[id] ?? at(row, i + 1), data: { task: t.id, model: s.model, step: { ...s } } })
      edges.push({ id: edgeId(prev, id), source: prev, target: id, label: i === 0 ? 'first' : 'if it fails' })
      prev = id
    })
    const used = new Set(chain.map((s) => s.model))
    let parked = 0
    for (const m of Object.values(MODELS)) {
      if (!m.tasks.includes(t.id) || used.has(m.id)) continue
      const id = modelNodeId(t.id, m.id)
      nodes.push({ id, type: 'model', position: lay[id] ?? (tall ? at(row, chain.length + parked + 1, 1) : at(row, parked + 1, 1)), data: { task: t.id, model: m.id, step: { model: m.id } } })
      parked++
    }
  })
  return { nodes, edges }
}

/**
 * Walk each task's chain of links. Unlinked model nodes are not in the route; a loop stops the walk.
 * Positions go to `layoutTall` when `tall`, keeping the other layout from `base`.
 */
export function graphToRouting(nodes: GraphNode[], edges: { source: string; target: string }[], tall = false, base?: Routing): Routing {
  const out = new Map<string, string>()
  for (const e of edges) if (!out.has(e.source)) out.set(e.source, e.target)
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const routes = {} as Routes
  for (const t of TASKS) {
    routes[t.id] = []
    const seen = new Set<string>()
    let cur = out.get(taskNodeId(t.id))
    while (cur && !seen.has(cur)) {
      seen.add(cur)
      const p = parseNodeId(cur)
      if (!p?.model || p.task !== t.id) break
      const step = byId.get(cur)?.data.step
      routes[t.id].push({ ...(step ?? {}), model: p.model })
      cur = out.get(cur)
    }
  }
  const layout: Record<string, XY> = {}
  for (const n of nodes) layout[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) }
  return normalizeRouting(tall
    ? { version: 1, routes, layout: base?.layout, layoutTall: layout }
    : { version: 1, routes, layout, layoutTall: base?.layoutTall })
}

/**
 * Can `source` link to `target`? Same task, flows rightward into a model, no link back into
 * the task node, and no loop. Returns a reason when it can't.
 */
export function canConnect(source: string, target: string, edges: { source: string; target: string }[]): string | null {
  const s = parseNodeId(source)
  const t = parseNodeId(target)
  if (!s || !t) return 'Unknown node'
  if (!t.model) return 'A task can only start a route'
  if (s.task !== t.task) return `${MODELS[t.model].label} can't do ${TASKS.find((x) => x.id === s.task)!.label.toLowerCase()}`
  if (source === target) return 'A model cannot fall back to itself'
  // Adding source -> target makes a loop if target already reaches source.
  const out = new Map<string, string>()
  for (const e of edges) if (e.source !== source && e.target !== target) out.set(e.source, e.target)
  let cur: string | undefined = target
  const seen = new Set<string>()
  while (cur && !seen.has(cur)) {
    if (cur === source) return 'That would make a loop'
    seen.add(cur)
    cur = out.get(cur)
  }
  return null
}

/** The edges after linking source -> target: any other link out of source or into target is replaced. */
export function connectEdges<E extends { source: string; target: string }>(edges: E[], source: string, target: string, make: (s: string, t: string) => E): E[] {
  return [...edges.filter((e) => e.source !== source && e.target !== target), make(source, target)]
}

// ---------- running a route ----------

export class RouteTimeoutError extends Error {
  constructor(sec: number) {
    super(`Timed out after ${sec} s`)
    this.name = 'TimeoutError'
  }
}

export function withTimeout<T>(p: Promise<T>, sec?: number): Promise<T> {
  if (!sec || sec <= 0) return p
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new RouteTimeoutError(sec)), sec * 1000)
    p.then((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
  })
}

/** Why a model call failed, from the error it threw. */
export function failReason(err: unknown, online = true): FailReason {
  const e = err as any
  const name = String(e?.name ?? '')
  const msg = String(e?.message ?? e ?? '')
  const code = String(e?.code ?? e?.error ?? '')
  const status = Number(e?.status ?? e?.statusCode ?? 0)
  if (name === 'TimeoutError' || /timed? ?out/i.test(msg)) return 'timeout'
  if (status === 429 || /quota|rate.?limit|too many requests|resource.?exhausted|429/i.test(`${msg} ${code}`)) return 'quota'
  if (!online || code === 'network' || /network|offline|failed to fetch|internet connection/i.test(msg)) return 'offline'
  return 'error'
}

export const FAIL_TEXT: Record<FailReason, string> = {
  timeout: 'timed out',
  quota: 'hit its quota',
  offline: 'needs a connection',
  unavailable: 'is not available',
  cooling: 'is resting after hitting its quota',
  error: 'failed',
}

/** model -> epoch ms until which it is skipped. */
export type Cooldowns = Map<ModelId, number>

export function coolingDown(c: Cooldowns, m: ModelId, now = Date.now()): boolean {
  return (c.get(m) ?? 0) > now
}

export interface Attempt { model: ModelId; reason: FailReason; message?: string }

export interface RunOptions {
  /** False when the model can't run right now (not downloaded, offline, unsupported). */
  isAvailable?: (m: ModelId) => boolean
  cooldowns?: Cooldowns
  online?: boolean
  now?: () => number
}

export class RouteFailedError extends Error {
  attempts: Attempt[]
  constructor(attempts: Attempt[]) {
    super(
      attempts.length
        ? attempts.map((a) => `${MODELS[a.model].label} ${FAIL_TEXT[a.reason]}${a.message && a.reason === 'error' ? ` (${a.message})` : ''}`).join(', then ')
        : 'No model is set up for this. Add one under Settings, Model routing.',
    )
    this.name = 'RouteFailedError'
    this.attempts = attempts
  }
}

/** First step that can run now, and the ones skipped on the way. For choices made up front (live speech). */
export function pickStep(steps: RouteStep[], opts: RunOptions = {}): { step?: RouteStep; skipped: Attempt[] } {
  const now = opts.now?.() ?? Date.now()
  const skipped: Attempt[] = []
  for (const s of steps) {
    if (opts.cooldowns && coolingDown(opts.cooldowns, s.model, now)) { skipped.push({ model: s.model, reason: 'cooling' }); continue }
    if (opts.isAvailable && !opts.isAvailable(s.model)) { skipped.push({ model: s.model, reason: 'unavailable' }); continue }
    return { step: s, skipped }
  }
  return { skipped }
}

/** Mark a failure; quota failures rest the model for its cooldown. */
export function noteFailure(c: Cooldowns, step: RouteStep, reason: FailReason, now = Date.now()) {
  if (reason !== 'quota') return
  const min = step.cooldownMin ?? DEFAULT_COOLDOWN_MIN
  if (min > 0) c.set(step.model, now + min * 60_000)
}

/**
 * Try each step in order until one succeeds. Each call gets the step's timeout. Throws
 * RouteFailedError listing every attempt when all fail.
 */
export async function runRoute<T>(steps: RouteStep[], call: (step: RouteStep) => Promise<T>, opts: RunOptions = {}): Promise<{ value: T; model: ModelId; attempts: Attempt[] }> {
  const attempts: Attempt[] = []
  const now = () => opts.now?.() ?? Date.now()
  for (const s of steps) {
    if (opts.cooldowns && coolingDown(opts.cooldowns, s.model, now())) { attempts.push({ model: s.model, reason: 'cooling' }); continue }
    if (opts.isAvailable && !opts.isAvailable(s.model)) { attempts.push({ model: s.model, reason: 'unavailable' }); continue }
    try {
      const value = await withTimeout(call(s), s.timeoutSec)
      return { value, model: s.model, attempts }
    } catch (e: any) {
      const reason = failReason(e, opts.online ?? true)
      if (opts.cooldowns) noteFailure(opts.cooldowns, s, reason, now())
      attempts.push({ model: s.model, reason, message: e?.message })
    }
  }
  throw new RouteFailedError(attempts)
}
