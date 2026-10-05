import { setCookie } from 'h3'
import { requireUserId } from '../../utils/auth'
import { authUrl, makeState, STATE_COOKIE } from '../../utils/google'

export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const { state, nonce } = makeState(userId)
  setCookie(event, STATE_COOKIE, nonce, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/google', maxAge: 600 })
  return { url: authUrl(event, state) }
})
