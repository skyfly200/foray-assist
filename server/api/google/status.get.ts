import { getTokens, requireUserId } from '../../utils/auth'
import { GOOGLE_SCOPE } from '../../utils/google'

export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const t = await getTokens(userId, 'google')
  const configured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
  return {
    configured,
    connected: !!t && !!(t.refresh_token || t.access_token),
    scopeOk: !!t && String(t.extra?.scope ?? '').includes(GOOGLE_SCOPE),
  }
})
