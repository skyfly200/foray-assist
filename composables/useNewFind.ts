// Bottom-bar "New find": snap a photo from anywhere and file it under the right foray.
import { createFindFromPhotos } from '~/composables/useFinds'
import { pickCaptureForay } from '~/utils/captureTarget'
import { readPhotoMeta } from '~/utils/exif'
import { pastForayName, summarizePhotos, FRESH_PHOTO_MS } from '~/utils/pastForay'

/** Starts a foray now; the name defaults to today's date. Pass `when` to log a past foray (already ended). */
export async function startForay(name?: string, when?: { startedAt: string; endedAt: string }): Promise<Foray> {
  const now = nowIso()
  const row: Foray = {
    id: newId(),
    name: name?.trim() || `Foray ${new Date(when?.startedAt ?? now).toLocaleDateString()}`,
    startedAt: when?.startedAt ?? now,
    ...(when ? { endedAt: when.endedAt } : {}),
    updatedAt: now,
  }
  await useDb().forays.add(row)
  await enqueue('forays', row.id)
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
  useLastNewFind().value = find.id
  return { forayId, findId: find.id }
}
