// multipart/form-data with one `file` part (client-downscaled JPEG, one per request).
export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 400, statusMessage: 'Bad observation id' })
  const parts = (await readMultipartFormData(event)) ?? []
  const file = parts.find((p) => p.name === 'file' && p.data?.length)
  if (!file) throw createError({ statusCode: 400, statusMessage: 'Missing file part' })
  try {
    const jwt = await getInatJwt(userId)
    const blob = new Blob([file.data], { type: file.type || 'image/jpeg' })
    const photoId = await uploadPhoto(jwt, id, blob, file.filename || 'photo.jpg')
    return { ok: true, photoId }
  } catch (e) { throw toHttpError(e) }
})
