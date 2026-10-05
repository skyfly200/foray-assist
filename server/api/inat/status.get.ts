export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const t = await getTokens(userId, 'inat')
  return { connected: !!t?.access_token, login: t?.extra?.login ?? null }
})
