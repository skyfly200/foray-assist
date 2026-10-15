// Bottom-bar "New find": snap a photo from anywhere and file it under the right foray.
import { addPhoto, createFind } from '~/composables/useFinds'
import { pickCaptureForay } from '~/utils/captureTarget'

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

/** Creates a find holding these photos in the foray on screen, else the newest open foray, else a new one. */
export async function newFindFromPhotos(files: File[], currentForayId?: string | null) {
  const forays = await useDb().forays.toArray()
  const forayId = pickCaptureForay(forays, currentForayId) ?? (await startForay()).id
  const find = await createFind(forayId)
  for (const f of files) await addPhoto(find.id, forayId, f, 'capture')
  useLastNewFind().value = find.id
  return { forayId, findId: find.id }
}
