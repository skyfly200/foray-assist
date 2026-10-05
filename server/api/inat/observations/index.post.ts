// Body: { find: FindInput, positionalAccuracy?, existingObservationId? }
// Idempotent: if the client already has an observation id, return it unchanged.
export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const body: any = await readBody(event)
  const existing = Number(body?.existingObservationId)
  if (Number.isInteger(existing) && existing > 0) return { id: existing, created: false }
  let payload
  try {
    payload = buildObservationPayload({ ...(body?.find ?? {}), positionalAccuracy: body?.positionalAccuracy ?? body?.find?.positionalAccuracy })
  } catch (e: any) {
    throw createError({ statusCode: 400, statusMessage: e.message })
  }
  try {
    const jwt = await getInatJwt(userId)
    const id = await createObservation(jwt, payload)
    return { id, created: true }
  } catch (e) { throw toHttpError(e) }
})
