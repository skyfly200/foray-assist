import { deleteTokens, getTokens, requireUserId } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const t = await getTokens(userId, 'google')
  const token = t?.refresh_token || t?.access_token
  if (token) {
    try {
      await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }),
      })
    } catch { /* best effort */ }
  }
  await deleteTokens(userId, 'google')
  return { ok: true }
})
