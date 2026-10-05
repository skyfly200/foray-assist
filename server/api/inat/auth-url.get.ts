export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const { appId, secret } = inatEnv()
  const state = await signState(secret, userId)
  return { url: authorizeUrl(appId, `${appOrigin(event)}/api/inat/callback`, state) }
})
