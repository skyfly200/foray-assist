// Guards for work that can hang: timeouts, stall detection, and error messages a person can act on
// (quota / rate limit, timeout, offline). Pure, so tests/taskguard.test.mjs covers it.

export class TimeoutError extends Error {
  constructor(message = 'Timed out') {
    super(message)
    this.name = 'TimeoutError'
  }
}

/** Rejects with TimeoutError if `p` has not settled within `ms`. `onTimeout` runs first (e.g. to kill the worker). */
export function withTimeout<T>(p: Promise<T>, ms: number, message?: string, onTimeout?: () => void): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined
  const timer = new Promise<never>((_, reject) => {
    t = setTimeout(() => {
      try { onTimeout?.() } catch { /* ignore */ }
      reject(new TimeoutError(message ?? `Timed out after ${Math.round(ms / 1000)} s`))
    }, ms)
  })
  return Promise.race([p, timer]).finally(() => clearTimeout(t))
}

/**
 * Calls `onStall` once if `poke()` is not called for `ms`. Start it when a task starts,
 * poke on every sign of progress, stop() when the task settles.
 */
export function stallWatch(ms: number, onStall: () => void) {
  let t: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  const arm = () => {
    if (stopped) return
    clearTimeout(t)
    t = setTimeout(() => { stopped = true; onStall() }, ms)
  }
  arm()
  return {
    poke: arm,
    stop() { stopped = true; clearTimeout(t) },
    /** Change the allowed gap (e.g. a slower phase) and restart the clock. */
    setLimit(next: number) { ms = next; arm() },
  }
}

/** Generous upper bound for transcribing `samples` of 16 kHz audio on a slow phone (WASM). */
export function transcribeTimeoutMs(samples: number, sampleRate = 16000): number {
  const seconds = samples / sampleRate
  return Math.min(15 * 60_000, 90_000 + Math.ceil(seconds * 10_000))
}

/** HTTP status from fetch/ofetch/Supabase/Transformers.js errors, if there is one. */
export function errorStatus(e: unknown): number | undefined {
  const err: any = e
  if (!err) return undefined
  for (const v of [err.status, err.statusCode, err.response?.status, err.data?.statusCode]) {
    const n = typeof v === 'string' ? Number(v) : v
    if (typeof n === 'number' && Number.isInteger(n) && n >= 100 && n < 600) return n
  }
  // Transformers.js: 'Error (429) occurred while trying to load file: "…"'
  const m = /\((\d{3})\)/.exec(String(err.message ?? ''))
  return m ? Number(m[1]) : undefined
}

/** "Retry-After" header (seconds or HTTP date) -> seconds, or undefined. */
export function retryAfterSeconds(v: string | null | undefined, now = Date.now()): number | undefined {
  if (!v) return undefined
  const n = Number(v)
  if (Number.isFinite(n) && n >= 0) return Math.ceil(n)
  const d = Date.parse(v)
  return Number.isNaN(d) ? undefined : Math.max(0, Math.ceil((d - now) / 1000))
}

const wait = (s?: number) => (s && s > 0 ? (s < 90 ? `about ${s} seconds` : `about ${Math.ceil(s / 60)} minutes`) : 'a few minutes')

export function isRateLimited(e: unknown): boolean {
  const msg = String((e as any)?.message ?? e ?? '')
  return errorStatus(e) === 429 || /too many requests|rate.?limit|quota/i.test(msg)
}

/**
 * One sentence a person can act on. `service` names who answered, e.g. 'Hugging Face'.
 * Quota/rate limits (HTTP 429) and timeouts get their own wording; anything else keeps its message.
 */
export function friendlyError(e: unknown, service = 'The server', retryAfter?: number): string {
  const err: any = e
  const raw = String(err?.statusMessage || err?.data?.statusMessage || err?.message || err || 'Something went wrong')
  if (/press retry/i.test(raw)) return raw // already worded by an inner layer (e.g. the voice worker)
  if (isRateLimited(e)) {
    return `${service} is limiting requests right now (HTTP 429, rate limit or quota). Wait ${wait(retryAfter ?? err?.retryAfter)}, then press Retry.`
  }
  if (err?.name === 'TimeoutError' || /timed? ?out|timeout/i.test(raw)) {
    return `${raw.replace(/\.$/, '')}. Press Retry to try again.`
  }
  if (/failed to fetch|networkerror|network request failed|load failed|you are offline/i.test(raw)) {
    return `Could not reach ${service === 'The server' ? 'the server' : service}. Check your connection, then press Retry.`
  }
  return raw
}
