// Browser redirect target from iNaturalist (no Authorization header): the
// signed `state` identifies the user who started the flow.
export default defineEventHandler(async (event) => {
  const { code, state, error } = getQuery(event) as Record<string, string>
  const back = (r: string) => sendRedirect(event, `${appOrigin(event)}/settings?inat=${r}`, 302)
  if (error || !code || !state) return back('denied')
  try {
    const { appId, secret } = inatEnv()
    const userId = await verifyState(secret, String(state))
    if (!userId) return back('badstate')
    const tok = await exchangeCode(appId, secret, `${appOrigin(event)}/api/inat/callback`, String(code))
    const jwt = await fetchApiJwt(tok.access_token)
    const login = await fetchLogin(jwt)
    await saveTokens(userId, 'inat', {
      access_token: tok.access_token,
      refresh_token: tok.refresh_token ?? null,
      expires_at: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000).toISOString() : null,
      extra: { login, jwt, jwt_exp: Date.now() + 23 * 3600_000 },
    })
    return back('connected')
  } catch {
    return back('error')
  }
})
