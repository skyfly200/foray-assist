// Review Mode core (SPEC §2.2, §3.1, §3.2). All on-device; writes go through the outbox.
import { nextSpecimenId } from '~/utils/specimenId'
import { clusterPhotos, withinWindow, DEFAULT_MAX_METERS, DEFAULT_MAX_SECONDS } from '~/utils/cluster'
import { readPhotoMeta } from '~/utils/exif'
import type { Photo, Specimen } from '~/utils/db'

// ---------- blur worker client (singleton, falls back to main thread) ----------
let worker: Worker | null = null
let workerBroken = false
const pending = new Map<string, { resolve: (n: number) => void; reject: (e: Error) => void }>()

function getWorker(): Worker | null {
  if (workerBroken || typeof Worker === 'undefined') return null
  if (!worker) {
    try {
      worker = new Worker(new URL('../workers/blur.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (e: MessageEvent<{ id: string; score?: number; error?: string }>) => {
        const p = pending.get(e.data.id)
        if (!p) return
        pending.delete(e.data.id)
        if (e.data.error || typeof e.data.score !== 'number') p.reject(new Error(e.data.error ?? 'no score'))
        else p.resolve(e.data.score)
      }
      worker.onerror = () => {
        workerBroken = true
        for (const p of pending.values()) p.reject(new Error('blur worker failed'))
        pending.clear()
        worker?.terminate()
        worker = null
      }
    } catch {
      workerBroken = true
      worker = null
    }
  }
  return worker
}

/** Blur score for an image blob (higher = sharper). Uses the worker; falls back to the main thread. */
export async function scoreBlob(blob: Blob): Promise<number> {
  const w = getWorker()
  if (w) {
    try {
      return await new Promise<number>((resolve, reject) => {
        const id = newId()
        pending.set(id, { resolve, reject })
        w.postMessage({ id, blob })
      })
    } catch {
      /* fall through to main thread */
    }
  }
  const { scoreBitmap } = await import('~/utils/blur')
  const bmp = await createImageBitmap(blob)
  try {
    return scoreBitmap(bmp)
  } finally {
    bmp.close()
  }
}

// ---------- import ----------
export const externalIdFor = (f: File) => `${f.name}|${f.size}|${f.lastModified}`

/** Photo picker import. Dedupes on externalId; stores unassigned (specimenRowId ''). */
export async function importFiles(forayId: string, files: File[]): Promise<{ added: number; skipped: number }> {
  const db = useDb()
  const rows: Photo[] = []
  let skipped = 0
  const seen = new Set<string>()
  for (const f of files) {
    if (f.type && !f.type.startsWith('image/')) {
      skipped++
      continue
    }
    const externalId = externalIdFor(f)
    if (seen.has(externalId) || (await db.photos.where('externalId').equals(externalId).count()) > 0) {
      skipped++
      continue
    }
    seen.add(externalId)
    const meta = await readPhotoMeta(f)
    let width: number | undefined
    let height: number | undefined
    try {
      const bmp = await createImageBitmap(f)
      width = bmp.width
      height = bmp.height
      bmp.close()
    } catch {
      /* dimensions are optional */
    }
    const now = nowIso()
    rows.push({
      id: newId(),
      specimenRowId: '',
      forayId,
      externalId,
      ...(width ? { width, height } : {}),
      source: 'picker',
      blob: f,
      mimeType: f.type || 'image/jpeg',
      capturedAt: meta.capturedAt,
      ...(meta.latitude !== undefined ? { latitude: meta.latitude, longitude: meta.longitude } : {}),
      isSelected: false,
      updatedAt: now,
    })
  }
  if (rows.length) {
    await db.transaction('rw', db.photos, db.outbox, async () => {
      await db.photos.bulkAdd(rows)
      for (const r of rows) await enqueue('photos', r.id)
    })
  }
  return { added: rows.length, skipped }
}

// ---------- scoring ----------
/** Blur-score every unscored photo in the foray. Resumable; one tx per photo. */
export async function scorePhotos(forayId: string, onProgress?: (done: number, total: number) => void): Promise<number> {
  const db = useDb()
  const todo = await db.photos.where('forayId').equals(forayId).filter((p) => p.blurScore === undefined).primaryKeys()
  let done = 0
  onProgress?.(0, todo.length)
  for (const id of todo as string[]) {
    const p = await db.photos.get(id)
    if (p && p.blurScore === undefined) {
      try {
        const score = await scoreBlob(p.blob)
        await db.transaction('rw', db.photos, db.outbox, async () => {
          await db.photos.update(id, { blurScore: score, updatedAt: nowIso() })
          await enqueue('photos', id)
        })
      } catch (e) {
        console.warn('blur score failed', id, e) // undecodable image: leave unscored
      }
    }
    onProgress?.(++done, todo.length)
  }
  return todo.length
}

// ---------- selection ----------
/**
 * Flag the sharpest 2-4 photos of a find: up to 4, but only those scoring at least
 * 40% of the best (always at least min(2, n)). Overwrites isSelected for that find.
 * With onlyIfNone, leaves the find alone if the user (or an earlier run) already selected photos.
 */
export async function autoSelect(specimenRowId: string, opts: { onlyIfNone?: boolean } = {}): Promise<string[]> {
  const db = useDb()
  return db.transaction('rw', db.photos, db.outbox, async () => {
    const photos = await db.photos.where('specimenRowId').equals(specimenRowId).toArray()
    if (opts.onlyIfNone && photos.some((p) => p.isSelected)) return photos.filter((p) => p.isSelected).map((p) => p.id)
    const scored = photos.filter((p) => typeof p.blurScore === 'number').sort((a, b) => b.blurScore! - a.blurScore! || a.capturedAt.localeCompare(b.capturedAt))
    const ranked = scored.length ? scored : [...photos].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
    const best = scored.length ? scored[0].blurScore! : 0
    const minKeep = Math.min(2, ranked.length)
    const chosen = ranked.filter((p, i) => i < minKeep || (i < 4 && scored.length > 0 && p.blurScore! >= 0.4 * best))
    const ids = new Set(chosen.map((p) => p.id))
    for (const p of photos) {
      if (p.isSelected !== ids.has(p.id)) {
        await db.photos.update(p.id, { isSelected: ids.has(p.id), updatedAt: nowIso() })
        await enqueue('photos', p.id)
      }
    }
    return [...ids]
  })
}

export async function setPhotoSelected(photoId: string, isSelected: boolean) {
  const db = useDb()
  await db.transaction('rw', db.photos, db.outbox, async () => {
    await db.photos.update(photoId, { isSelected, updatedAt: nowIso() })
    await enqueue('photos', photoId)
  })
}

// ---------- clustering ----------
interface Anchor {
  t: number
  latitude?: number
  longitude?: number
}

/**
 * Group unassigned photos (specimenRowId '') of a foray into finds.
 * 1. Photos within 120 s / 5 m of an existing find (its own timestamp/GPS or any of its photos) join it.
 * 2. The rest are clustered into NEW specimens (specimen time/GPS from the first photo; GPS from the
 *    first photo that has any), geoprivacy 'obscured'.
 * Top photos are auto-selected for new finds (and merged finds that have no selection yet).
 */
export async function clusterUnassigned(forayId: string): Promise<{ created: number; merged: number; photos: number }> {
  const db = useDb()
  const unassigned = await db.photos.where('forayId').equals(forayId).filter((p) => p.specimenRowId === '').toArray()
  if (!unassigned.length) return { created: 0, merged: 0, photos: 0 }

  const specimens = await db.specimens.where('forayId').equals(forayId).toArray()
  const assigned = await db.photos.where('forayId').equals(forayId).filter((p) => p.specimenRowId !== '').toArray()
  const anchors = new Map<string, Anchor[]>()
  for (const s of specimens) anchors.set(s.id, [{ t: Date.parse(s.timestamp), latitude: s.latitude, longitude: s.longitude }])
  for (const p of assigned) anchors.get(p.specimenRowId)?.push({ t: Date.parse(p.capturedAt), latitude: p.latitude, longitude: p.longitude })

  // Step 1: merge into existing finds (closest in time wins).
  const joins = new Map<string, string[]>() // specimen id -> photo ids
  const rest: Photo[] = []
  for (const p of unassigned) {
    const pa = { t: Date.parse(p.capturedAt), latitude: p.latitude, longitude: p.longitude }
    let best: { id: string; dt: number } | null = null
    for (const [sid, list] of anchors) {
      for (const a of list) {
        if (!withinWindow(a, pa, DEFAULT_MAX_SECONDS, DEFAULT_MAX_METERS)) continue
        const dt = Math.abs(a.t - pa.t)
        if (!best || dt < best.dt || (dt === best.dt && sid < best.id)) best = { id: sid, dt }
      }
    }
    if (best) joins.set(best.id, [...(joins.get(best.id) ?? []), p.id])
    else rest.push(p)
  }

  // Step 2: cluster the remainder.
  const byId = new Map(rest.map((p) => [p.id, p]))
  const groups = clusterPhotos(rest.map((p) => ({ id: p.id, capturedAt: p.capturedAt, latitude: p.latitude, longitude: p.longitude })))

  // Reserve IDs before the write transaction (nextSpecimenId runs its own tx; gaps on failure are acceptable).
  const newSpecimens: { row: Specimen; photoIds: string[] }[] = []
  for (const g of groups) {
    const first = byId.get(g[0])!
    const gps = g.map((id) => byId.get(id)!).find((p) => p.latitude !== undefined && p.longitude !== undefined)
    const now = nowIso()
    newSpecimens.push({
      photoIds: g,
      row: {
        id: newId(),
        specimenId: await nextSpecimenId(),
        forayId,
        timestamp: first.capturedAt,
        ...(gps ? { latitude: gps.latitude, longitude: gps.longitude } : {}),
        geoprivacy: 'obscured',
        fieldNotes: {},
        updatedAt: now,
      },
    })
  }

  await db.transaction('rw', db.specimens, db.photos, db.outbox, async () => {
    const assign = async (specimenRowId: string, ids: string[]) => {
      for (const id of ids) {
        await db.photos.update(id, { specimenRowId, isSelected: false, updatedAt: nowIso() })
        await enqueue('photos', id)
      }
    }
    for (const { row, photoIds } of newSpecimens) {
      await db.specimens.add(row)
      await enqueue('specimens', row.id)
      await assign(row.id, photoIds)
    }
    for (const [sid, ids] of joins) await assign(sid, ids)
  })

  for (const { row } of newSpecimens) await autoSelect(row.id)
  for (const sid of joins.keys()) await autoSelect(sid, { onlyIfNone: true })

  return { created: newSpecimens.length, merged: joins.size, photos: unassigned.length }
}

// ---------- moving photos ----------
/** Move a photo to another find, or to '' to un-assign it. Clears its selection flag. */
export async function movePhoto(photoId: string, targetSpecimenRowId: string) {
  const db = useDb()
  await db.transaction('rw', db.photos, db.outbox, async () => {
    await db.photos.update(photoId, { specimenRowId: targetSpecimenRowId, isSelected: false, updatedAt: nowIso() })
    await enqueue('photos', photoId)
  })
}

/** Move a photo into a brand-new find (timestamp/GPS from the photo). */
export async function movePhotoToNewFind(photoId: string): Promise<Specimen | null> {
  const db = useDb()
  const p = await db.photos.get(photoId)
  if (!p) return null
  const row: Specimen = {
    id: newId(),
    specimenId: await nextSpecimenId(),
    forayId: p.forayId,
    timestamp: p.capturedAt,
    ...(p.latitude !== undefined ? { latitude: p.latitude, longitude: p.longitude } : {}),
    geoprivacy: 'obscured',
    fieldNotes: {},
    updatedAt: nowIso(),
  }
  await db.transaction('rw', db.specimens, db.photos, db.outbox, async () => {
    await db.specimens.add(row)
    await enqueue('specimens', row.id)
    await db.photos.update(photoId, { specimenRowId: row.id, isSelected: true, updatedAt: nowIso() })
    await enqueue('photos', photoId)
  })
  return row
}
