import { requireUserId } from '../../utils/auth'
import { pickerJson } from '../../utils/google'

export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const s = await pickerJson(userId, '/sessions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pickingConfig: { maxItemCount: '200' } }),
  })
  return {
    id: s.id,
    // "/autoclose" makes Google close the picker tab when the user finishes.
    pickerUri: String(s.pickerUri) + '/autoclose',
    pollIntervalMs: parseDuration(s.pollingConfig?.pollInterval, 3000),
    timeoutMs: parseDuration(s.pollingConfig?.timeoutIn, 600_000),
  }
})

function parseDuration(d: unknown, fallback: number) {
  const n = parseFloat(String(d ?? ''))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) : fallback
}
