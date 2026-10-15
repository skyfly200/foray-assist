// Foray Mode find logging. Everything is local (Dexie); sync happens via the outbox.
import { liveQuery } from 'dexie'
import { computed, onMounted, onBeforeUnmount, ref, type Ref } from 'vue'
import { nextSpecimenId } from '~/utils/specimenId'
import { isEmptyFind } from '~/utils/findEmpty'
import type { FieldNotes, Geoprivacy, Photo, Specimen } from '~/utils/db'

/** Best-effort position; resolves null on denial/timeout/unsupported. Never rejects. */
export function getPositionBestEffort(timeoutMs = 4000): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null)
    let done = false
    const finish = (v: { latitude: number; longitude: number } | null) => {
      if (!done) {
        done = true
        resolve(v)
      }
    }
    const timer = setTimeout(() => finish(null), timeoutMs + 500)
    try {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          clearTimeout(timer)
          finish({ latitude: p.coords.latitude, longitude: p.coords.longitude })
        },
        () => {
          clearTimeout(timer)
          finish(null)
        },
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
      )
    } catch {
      clearTimeout(timer)
      finish(null)
    }
  })
}

/** Creates the find immediately (offline-safe); GPS is filled in afterwards if it arrives. */
export async function createFind(forayId: string): Promise<Specimen> {
  const db = useDb()
  const specimenId = await nextSpecimenId()
  const now = nowIso()
  const row: Specimen = {
    id: newId(),
    specimenId,
    forayId,
    timestamp: now,
    geoprivacy: 'obscured',
    fieldNotes: {},
    updatedAt: now,
  }
  await db.transaction('rw', db.specimens, db.outbox, async () => {
    await db.specimens.add(row)
    await enqueue('specimens', row.id)
  })
  // Fire and forget: never block the UI on GPS.
  void getPositionBestEffort().then(async (pos) => {
    if (!pos) return
    await db.transaction('rw', db.specimens, db.outbox, async () => {
      const cur = await db.specimens.get(row.id)
      if (!cur) return
      await db.specimens.update(row.id, { ...pos, updatedAt: nowIso() })
      await enqueue('specimens', row.id)
    })
  })
  return row
}

/** Merge a partial patch into fieldNotes. Empty strings clear the key. Debounce-friendly. */
export async function updateFieldNotes(id: string, patch: Partial<FieldNotes>) {
  const db = useDb()
  await db.transaction('rw', db.specimens, db.outbox, async () => {
    const cur = await db.specimens.get(id)
    if (!cur) return
    const merged: FieldNotes = { ...cur.fieldNotes, ...patch }
    for (const k of Object.keys(merged) as (keyof FieldNotes)[]) {
      if (merged[k] === undefined || merged[k] === '') delete merged[k]
    }
    await db.specimens.update(id, { fieldNotes: merged, updatedAt: nowIso() })
    await enqueue('specimens', id)
  })
}

export async function setGeoprivacy(id: string, geoprivacy: Geoprivacy) {
  const db = useDb()
  await db.transaction('rw', db.specimens, db.outbox, async () => {
    await db.specimens.update(id, { geoprivacy, updatedAt: nowIso() })
    await enqueue('specimens', id)
  })
}

export async function addPhoto(
  specimenRowId: string,
  forayId: string,
  blob: Blob,
  source: Photo['source'] = 'capture',
  angle?: Photo['angle'],
): Promise<Photo> {
  const db = useDb()
  const pos = await getPositionBestEffort(2500)
  const now = nowIso()
  const photo: Photo = {
    id: newId(),
    specimenRowId,
    forayId,
    source,
    blob,
    mimeType: blob.type || 'image/jpeg',
    capturedAt: now,
    ...(pos ?? {}),
    ...(angle ? { angle } : {}),
    isSelected: false,
    updatedAt: now,
  }
  await db.transaction('rw', db.photos, db.outbox, async () => {
    await db.photos.add(photo)
    await enqueue('photos', photo.id)
  })
  return photo
}

export async function removePhoto(id: string) {
  const db = useDb()
  await db.transaction('rw', db.photos, db.outbox, async () => {
    await db.photos.delete(id)
    await enqueue('photos', id, 'delete')
  })
}

/** Deletes the find, its photos and its voice notes locally and queues remote deletes. */
export async function deleteFind(id: string) {
  const db = useDb()
  await db.transaction('rw', db.specimens, db.photos, db.voiceNotes, db.outbox, async () => {
    const photoIds = (await db.photos.where('specimenRowId').equals(id).primaryKeys()) as string[]
    const noteIds = (await db.voiceNotes.where('specimenRowId').equals(id).primaryKeys()) as string[]
    await db.photos.bulkDelete(photoIds)
    await db.voiceNotes.bulkDelete(noteIds)
    await db.specimens.delete(id)
    for (const pid of photoIds) await enqueue('photos', pid, 'delete')
    for (const nid of noteIds) await enqueue('voiceNotes', nid, 'delete')
    await enqueue('specimens', id, 'delete')
  })
}

/** True when nothing was recorded on the find (see utils/findEmpty.ts). */
export async function findIsEmpty(find: Specimen): Promise<boolean> {
  const db = useDb()
  const [photos, voiceNotes, comments] = await Promise.all([
    db.photos.where('specimenRowId').equals(find.id).count(),
    db.voiceNotes.where('specimenRowId').equals(find.id).count(),
    db.comments.where('specimenRowId').equals(find.id).count(),
  ])
  return isEmptyFind({ ...find, fieldNotes: find.fieldNotes as Record<string, string | undefined> }, { photos, voiceNotes, comments })
}

/** Ids of the foray's empty finds. */
export async function emptyFindIds(forayId: string): Promise<string[]> {
  const rows = await useDb().specimens.where('forayId').equals(forayId).toArray()
  const flags = await Promise.all(rows.map(findIsEmpty))
  return rows.filter((_, i) => flags[i]).map((r) => r.id)
}

/** Delete the find if it is (still) empty. Returns true when it was removed. */
export async function removeIfEmpty(id: string): Promise<boolean> {
  if (!id) return false
  const row = await useDb().specimens.get(id)
  if (!row || !(await findIsEmpty(row))) return false
  await deleteFind(id)
  return true
}

/** Delete every empty find in the foray. Returns how many were removed. */
export async function removeEmptyFinds(forayId: string): Promise<number> {
  let n = 0
  for (const id of await emptyFindIds(forayId)) if (await removeIfEmpty(id)) n++
  return n
}

/**
 * Reactive Dexie liveQuery. Subscribes on mount, unsubscribes on unmount.
 * Call from component setup.
 */
export function useLiveQuery<T>(querier: () => T | Promise<T>, initial: T): Ref<T> {
  const data = ref(initial) as Ref<T>
  let sub: { unsubscribe: () => void } | null = null
  onMounted(() => {
    sub = liveQuery(querier).subscribe({
      next: (v) => (data.value = v),
      error: (e) => console.error('liveQuery', e),
    })
  })
  onBeforeUnmount(() => sub?.unsubscribe())
  return data
}

/** Live set of the foray's empty finds, for hiding them in Review Mode lists. */
export function useEmptyFindIds(forayId: () => string): Ref<Set<string>> {
  const ids = useLiveQuery<string[]>(() => emptyFindIds(forayId()), [])
  return computed(() => new Set(ids.value)) as unknown as Ref<Set<string>>
}
