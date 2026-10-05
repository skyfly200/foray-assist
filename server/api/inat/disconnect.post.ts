export default defineEventHandler(async (event) => {
  await deleteTokens(await requireUserId(event), 'inat')
  return { ok: true }
})
