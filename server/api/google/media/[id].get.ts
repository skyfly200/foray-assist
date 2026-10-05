import { createError, getQuery, getRouterParam, setHeader } from 'h3'
import { requireUserId } from '../../../utils/auth'
import { googleFetch, listPicked } from '../../../utils/google'

// Proxy the bytes of one picked item. ?session=<pickerSessionId> (required),
// ?size=original for the full-size download. Default is capped at 2560px because
// Vercel serverless responses are limited to ~4.5 MB.
export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const id = getRouterParam(event, 'id')
  const { session, size } = getQuery(event)
  if (!id || !session) throw createError({ statusCode: 400, statusMessage: 'Missing id or session' })
  const item = (await listPicked(userId, String(session))).find((m) => m.id === id)
  if (!item?.baseUrl) throw createError({ statusCode: 404, statusMessage: 'Picked item not found (session may have expired)' })
  const suffix = size === 'original' ? '=d' : '=w2560-h2560'
  const res = await googleFetch(userId, item.baseUrl + suffix)
  if (!res.ok) throw createError({ statusCode: 502, statusMessage: `Google download failed (${res.status})` })
  const buf = Buffer.from(await res.arrayBuffer())
  setHeader(event, 'content-type', res.headers.get('content-type') || item.mimeType || 'image/jpeg')
  setHeader(event, 'cache-control', 'private, no-store')
  if (item.createTime) setHeader(event, 'x-google-creation-time', item.createTime)
  if (item.filename) setHeader(event, 'x-google-filename', encodeURIComponent(item.filename))
  if (item.latitude != null && item.longitude != null) {
    setHeader(event, 'x-google-latitude', String(item.latitude))
    setHeader(event, 'x-google-longitude', String(item.longitude))
  }
  return buf
})
