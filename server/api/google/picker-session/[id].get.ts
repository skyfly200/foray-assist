import { createError, getRouterParam } from 'h3'
import { requireUserId } from '../../../utils/auth'
import { listPicked, pickerJson, publicItem } from '../../../utils/google'

// Poll a picker session. Once mediaItemsSet is true, also returns the picked items' metadata (no baseUrl).
export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing session id' })
  const s = await pickerJson(userId, `/sessions/${encodeURIComponent(id)}`)
  const done = !!s.mediaItemsSet
  return {
    id,
    mediaItemsSet: done,
    pollIntervalMs: Math.round(parseFloat(String(s.pollingConfig?.pollInterval ?? '3')) * 1000) || 3000,
    items: done ? (await listPicked(userId, id)).map(publicItem) : [],
  }
})
