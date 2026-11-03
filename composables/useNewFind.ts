// Bottom-bar "New find": snap a photo from anywhere and file it under the right foray.
import { createFind, createFindFromPhotos } from '~/composables/useFinds'
import { pickCaptureForay } from '~/utils/captureTarget'
import { readPhotoMeta } from '~/utils/exif'
import { pastForayName, summarizePhotos, FRESH_PHOTO_MS } from '~/utils/pastForay'
import { defaultForayName, dayOf } from '~/utils/forayName'
import { addPlaceToForayName } from '~/composables/useForayPlace'

/**
 * Starts a foray now. Without a name it's called "Foray <date>" and the place is added once known
 * (see useForayPlace). Pass `when` to log a past foray (already ended).
 */
export async function startForay(name?: string, when?: { startedAt: string; endedAt: string }): Promise<Foray> {
  const now = nowIso()
  const row: Foray = {
    id: newId(),
    name: name?.trim() || defaultForayName(dayOf(when?.startedAt ?? now)),
    startedAt: when?.startedAt ?? now,
    ...(when ? { endedAt: when.endedAt } : {}),
    updatedAt: now,
  }
  await useDb().forays.add(row)
  await enqueue('forays', row.id)
  if (!when) void addPlaceToForayName(row.id, true).catch(() => false)
  return row
}

/** True when this device may change the foray's row: not one we joined from someone else. */
export function canEditForay(f: Foray) {
  return !f.joined && (!f.shared || f.shared.role === 'owner')
}

/** Sets a foray's title; blank titles are ignored. */
export async function renameForay(id: string, name: string) {
  const title = name.trim()
  if (!title) return
  await useDb().forays.update(id, { name: title, updatedAt: nowIso() })
  await enqueue('forays', id)
}

/**
 * Deletes a foray with its finds, photos, voice notes and comments, here and on the server.
 * The server has no foreign keys to forays on these tables, so every child row gets its own
 * queued delete (photo files are removed with their rows). Only the foray's owner may call it.
 */
export async function deleteForay(id: string) {
  const db = useDb()
  await db.transaction('rw', db.forays, db.specimens, db.photos, db.voiceNotes, db.comments, db.peerFinds, db.nearbyAlerts, db.outbox, async () => {
    const findIds = (await db.specimens.where('forayId').equals(id).primaryKeys()) as string[]
    const photoIds = (await db.photos.where('forayId').equals(id).primaryKeys()) as string[]
    const noteIds = (await db.voiceNotes.where('forayId').equals(id).primaryKeys()) as string[]
    const commentIds = (await db.comments.where('forayId').equals(id).primaryKeys()) as string[]
    await db.specimens.bulkDelete(findIds)
    await db.photos.bulkDelete(photoIds)
    await db.voiceNotes.bulkDelete(noteIds)
    await db.comments.bulkDelete(commentIds)
    // Finds from other people and nearby alerts are local copies only; nothing to send.
    await db.peerFinds.where('forayId').equals(id).delete()
    await db.nearbyAlerts.where('forayId').equals(id).delete()
    await db.forays.delete(id)
    for (const pid of photoIds) await enqueue('photos', pid, 'delete')
    for (const nid of noteIds) await enqueue('voiceNotes', nid, 'delete')
    for (const cid of commentIds) await enqueue('comments', cid, 'delete')
    for (const sid of findIds) await enqueue('specimens', sid, 'delete')
    await enqueue('forays', id, 'delete')
  })
}

/** Id of the find created last from the bottom bar, so the find list can celebrate it. */
export const useLastNewFind = () => useState<string | null>('fa-last-new-find', () => null)

/**
 * Creates a find holding these photos in the foray on screen, else (for old gallery photos) the foray they
 * were taken during, else the newest open foray, else a new one dated from the photos.
 */
export async function newFindFromPhotos(files: File[], currentForayId?: string | null) {
  const forays = await useDb().forays.toArray()
  const metas = await Promise.all(files.map((f) => readPhotoMeta(f)))
  const s = summarizePhotos(metas)
  const old = s && Date.now() - Date.parse(s.endedAt) >= FRESH_PHOTO_MS ? s : null
  const forayId = pickCaptureForay(forays, currentForayId, old?.startedAt)
    ?? (await startForay(old ? pastForayName(old.day) : undefined, old ? { startedAt: old.startedAt, endedAt: old.endedAt } : undefined)).id
  const find = await createFindFromPhotos(forayId, files, metas)
  // A foray just made from old photos can take its place from their GPS straight away.
  void addPlaceToForayName(forayId).catch(() => false)
  useLastNewFind().value = find.id
  return { forayId, findId: find.id }
}

/** Creates an empty find for guided capture in the foray on screen, else the newest open foray, else a new one. */
export async function newBlankFind(currentForayId?: string | null) {
  const forays = await useDb().forays.toArray()
  const forayId = pickCaptureForay(forays, currentForayId) ?? (await startForay()).id
  const find = await createFind(forayId)
  useLastNewFind().value = find.id
  return { forayId, findId: find.id }
}
