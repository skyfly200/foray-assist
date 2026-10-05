import { deleteCookie, getCookie, getQuery, sendRedirect } from 'h3'
import { appOrigin } from '../../utils/auth'
import { googleExchangeCode, STATE_COOKIE, googleVerifyState } from '../../utils/google'

// Browser redirect from Google: no Authorization header, so identity comes from the signed state.
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const back = (r: string) => sendRedirect(event, `${appOrigin(event)}/settings?google=${r}`, 302)
  const nonce = getCookie(event, STATE_COOKIE)
  deleteCookie(event, STATE_COOKIE, { path: '/api/google' })
  if (q.error) return back('denied')
  try {
    const userId = googleVerifyState(String(q.state || ''), nonce)
    await googleExchangeCode(event, userId, String(q.code || ''))
    return back('connected')
  } catch {
    return back('error')
  }
})
