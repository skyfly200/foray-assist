// Pure sync-retry policy (no Dexie, no Supabase, no Vue). Erasable TS only so
// `node --experimental-strip-types --test tests/sync.test.mjs` can load it.
// useSync.ts owns the I/O; every decision lives here.
import type { OutboxItem } from './db'

/** Retry state persisted on the outbox row. Non-indexed => no Dexie schema bump. */
export interface OutboxRetryFields {
  nextAttemptAt?: string // ISO; item is not due before this
  parkedAt?: string // ISO; set => item is parked (skipped, row blocked)
  lastError?: string
}
/** OutboxItem + retry fields. Cast outbox rows to this until db.ts declares them. */
export type SyncOutboxItem = OutboxItem & OutboxRetryFields

/** Structural subset used by the pure functions (keeps tests free of db.ts). */
export interface PolicyItem {
  id?: number
  table: string
  rowId: string
  createdAt?: string
  attempts?: number
  nextAttemptAt?: string
  parkedAt?: string
}

export type ErrorClass = 'transient' | 'permanent' | 'auth'

export const PARK_AFTER_PERMANENT = 5
/** Generous cap: transient failures (outage, 5xx) only park after this many. */
export const PARK_AFTER_TRANSIENT = 30
export const BASE_BACKOFF_MS = 2_000
export const MAX_BACKOFF_MS = 5 * 60_000

function numStatus(v: unknown): number | undefined {
  if (typeof v === 'number' && v >= 100 && v < 600) return v
  if (typeof v === 'string' && /^\d{3}$/.test(v)) return Number(v)
  return undefined
}

function statusOf(e: any): number | undefined {
  for (const o of [e, e?.originalError, e?.cause, e?.response]) {
    if (!o || typeof o !== 'object') continue
    for (const k of ['status', 'statusCode', 'httpStatus']) {
      const n = numStatus(o[k])
      if (n !== undefined) return n
    }
  }
  return undefined
}

const TRANSIENT_SQLSTATE_CLASSES = new Set(['08', '40', '53', '55', '57', '58'])
const TRANSIENT_PGRST = new Set(['PGRST000', 'PGRST001', 'PGRST002', 'PGRST003'])
const AUTH_PGRST = new Set(['PGRST301', 'PGRST302', 'PGRST303'])
const AUTH_MSG = /jwt (is )?(expired|invalid)|invalid jwt|token (is )?expired|refresh_token|refresh token|not authenticated|auth session missing|session (expired|missing)/i
const NET_MSG = /failed to fetch|networkerror|network request failed|network error|load failed|fetch failed|timed? ?out|econn|enotfound|etimedout|err_internet|err_network|offline|aborted/i

/**
 * transient: retry later, never the item's fault (offline/fetch failure, 408/425/429/5xx,
 *            connection/resource SQLSTATE classes, unknown errors).
 * auth:      session expired/missing; pause the whole drain, do not count an attempt.
 * permanent: the request itself is wrong (other 4xx, RLS 42501, constraint/schema errors).
 */
export function classifyError(e: unknown): ErrorClass {
  if (e == null) return 'transient'
  const err: any = e
  const code = typeof err.code === 'string' ? err.code : ''
  const msg = [err.message, err.details, err.error_description, err.error]
    .filter((x) => typeof x === 'string').join(' ')
  const status = statusOf(err)

  if (status === 401 || AUTH_PGRST.has(code) || err.name === 'AuthSessionMissingError' || AUTH_MSG.test(msg)) {
    return 'auth'
  }
  if (status !== undefined) {
    if (status === 408 || status === 425 || status === 429 || status >= 500) return 'transient'
    if (status >= 400) return 'permanent'
  }
  if (code.startsWith('PGRST')) return TRANSIENT_PGRST.has(code) ? 'transient' : 'permanent'
  if (/^[0-9A-Z]{5}$/.test(code)) {
    return TRANSIENT_SQLSTATE_CLASSES.has(code.slice(0, 2)) ? 'transient' : 'permanent'
  }
  if (err.name === 'AbortError' || err.name === 'TimeoutError' || NET_MSG.test(msg)) return 'transient'
  if (err instanceof TypeError) return 'transient' // fetch() network failures surface as TypeError
  return 'transient' // unknown: never park data on a guess (the transient cap still bounds it)
}

/** Backoff after the Nth failed attempt (attempts >= 1): 2s, 4s, 8s ... capped at 5 min. */
export function nextBackoffMs(attempts: number): number {
  const n = Math.max(1, Math.floor(attempts || 1))
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.min(n - 1, 20))
}

/** attempts = count INCLUDING the failure just recorded. */
export function shouldPark(attempts: number, cls: ErrorClass = 'permanent'): boolean {
  if (cls === 'auth') return false
  return attempts >= (cls === 'transient' ? PARK_AFTER_TRANSIENT : PARK_AFTER_PERMANENT)
}

const rowKey = (i: PolicyItem) => i.table + '\u0000' + i.rowId
const isParked = (i: PolicyItem) => !!i.parkedAt
function isDue(i: PolicyItem, now: number): boolean {
  if (!i.nextAttemptAt) return true
  const t = Date.parse(i.nextAttemptAt)
  return Number.isNaN(t) || t <= now
}
function order(a: PolicyItem, b: PolicyItem): number {
  if (a.id !== undefined && b.id !== undefined) return a.id - b.id
  return String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''))
}

/**
 * Next item to process, or null. Items are considered in queue order; only the
 * FIRST item of each (table,rowId) is eligible, so a later op never overtakes an
 * earlier pending/backing-off/parked op on the same row. Unrelated rows proceed.
 */
export function pickNext<T extends PolicyItem>(items: readonly T[], now: number): T | null {
  const seen = new Set<string>()
  for (const item of [...items].sort(order)) {
    const k = rowKey(item)
    if (seen.has(k)) continue
    seen.add(k) // this item is its row's head
    if (isParked(item)) continue // parked head blocks the whole row
    if (isDue(item, now)) return item
  }
  return null
}

export function countParked(items: readonly PolicyItem[]): number {
  return items.filter(isParked).length
}
/** Pending = everything not parked (includes items waiting out a backoff). */
export function countPending(items: readonly PolicyItem[]): number {
  return items.filter((i) => !isParked(i)).length
}

export function formatError(e: unknown): string {
  const x: any = e
  const parts = [x?.code, x?.message ?? (typeof e === 'string' ? e : ''), x?.details].filter(
    (p) => typeof p === 'string' && p,
  )
  return (parts.join(': ') || String(e)).slice(0, 500)
}

export interface FailurePlan {
  cls: ErrorClass
  /** true => stop draining now (offline/outage/auth); false => carry on with other rows */
  stop: boolean
  /** fields to write onto the outbox row (use `undefined` to clear) */
  patch: Partial<OutboxRetryFields> & { attempts?: number }
}

/** Decide what to persist after a failed attempt. now = ms epoch. */
export function planFailure(item: PolicyItem, e: unknown, now: number): FailurePlan {
  const cls = classifyError(e)
  const lastError = formatError(e)
  if (cls === 'auth') return { cls, stop: true, patch: { lastError } }
  const attempts = (item.attempts ?? 0) + 1
  const patch: FailurePlan['patch'] = { attempts, lastError }
  if (shouldPark(attempts, cls)) patch.parkedAt = new Date(now).toISOString()
  else patch.nextAttemptAt = new Date(now + nextBackoffMs(attempts)).toISOString()
  return { cls, stop: cls === 'transient', patch }
}
