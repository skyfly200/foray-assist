import type { Geoprivacy } from '~/utils/db'
import { isPendingId } from '~/utils/idCode'
// iNaturalist publish queue (SPEC 3.6). State lives in Specimen.inatStatus /
// inatError / iNatObservationId (Dexie); never blocks field logging. Runs
// sequentially when online + signed in + iNat connected.
const MAX_EDGE = 2048
const PHOTO_GAP_MS = 400

const connected = ref(false)
const inatLogin = ref<string | null>(null)
const running = ref(false)
const statusChecked = ref(false)
let started = false
let again = false

async function downscale(blob: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(blob)
  const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
  bmp.close?.()
  return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Image encode failed'))), 'image/jpeg', 0.85))
}

const doneKey = (id: string) => `inatPhotos:${id}`
async function donePhotos(id: string): Promise<string[]> {
  const row = await useDb().settings.get(doneKey(id))
  return Array.isArray(row?.value) ? (row!.value as string[]) : []
}

async function setStatus(id: string, patch: Record<string, any>) {
  const db = useDb()
  await db.transaction('rw', db.specimens, db.outbox, async () => {
    await db.specimens.update(id, { ...patch, updatedAt: nowIso() })
    await enqueue('specimens', id)
  })
}

async function refreshStatus() {
  try {
    const r: any = await apiFetch('/api/inat/status')
    connected.value = !!r.connected
    inatLogin.value = r.login ?? null
  } catch { /* offline / signed out: keep last known */ }
  statusChecked.value = true
}

async function publishOne(id: string) {
  const db = useDb()
  const sp = await db.specimens.get(id)
  if (!sp) return
  // Never publish a find that has no ID yet; park it as a draft instead of failing it.
  if (isPendingId(sp.specimenId)) { await setStatus(id, { inatStatus: undefined, inatError: undefined }); return }
  try {
    let obsId = sp.iNatObservationId
    if (!obsId) {
      const r: any = await apiFetch('/api/inat/observations', {
        method: 'POST',
        body: {
          existingObservationId: sp.iNatObservationId,
          find: {
            specimenId: sp.specimenId, timestamp: sp.timestamp, latitude: sp.latitude, longitude: sp.longitude,
            geoprivacy: sp.geoprivacy, fieldNotes: sp.fieldNotes,
          },
        },
      })
      obsId = r.id as number
      // Persist the id immediately so a crash or retry never creates a duplicate.
      await setStatus(id, { iNatObservationId: obsId })
    }
    const photos = (await db.photos.where('specimenRowId').equals(id).toArray()).filter((p) => p.isSelected)
    const done = new Set(await donePhotos(id))
    for (const p of photos) {
      if (done.has(p.id)) continue
      const jpeg = await downscale(p.blob)
      const fd = new FormData()
      fd.append('file', jpeg, `${sp.specimenId}-${p.id.slice(0, 8)}.jpg`)
      await apiFetch(`/api/inat/observations/${obsId}/photos`, { method: 'POST', body: fd })
      done.add(p.id)
      await db.settings.put({ key: doneKey(id), value: [...done] })
      await new Promise((r) => setTimeout(r, PHOTO_GAP_MS))
    }
    await setStatus(id, { inatStatus: 'published', inatError: undefined })
  } catch (e: any) {
    const msg = e?.statusMessage || e?.data?.statusMessage || e?.message || 'Publish failed'
    await setStatus(id, { inatStatus: 'failed', inatError: String(msg).slice(0, 300) })
  }
}

async function runQueue() {
  if (running.value) { again = true; return }
  if (!import.meta.client) return
  const { online, signedIn } = useSync()
  if (!online.value || !signedIn.value || !connected.value) return
  running.value = true
  try {
    do {
      again = false
      const queued = await useDb().specimens.where('inatStatus').equals('queued').toArray()
      for (const sp of queued.sort((a, b) => a.timestamp.localeCompare(b.timestamp))) {
        if (!navigator.onLine) return
        await publishOne(sp.id)
      }
    } while (again)
  } finally { running.value = false }
}

export function usePublish() {
  const { online, signedIn } = useSync()

  if (import.meta.client && !started) {
    started = true
    watch([online, signedIn], async ([o, s]) => {
      if (o && s) { await refreshStatus(); runQueue() }
      else if (!s) { connected.value = false; inatLogin.value = null }
    }, { immediate: true })
    watch(connected, (c) => { if (c) runQueue() })
  }

  /** Queue finds for publishing (selected photos only). Safe offline. */
  async function queue(ids: string[]) {
    for (const id of ids) {
      const sp = await useDb().specimens.get(id)
      if (!sp || sp.inatStatus === 'queued') continue
      if (sp.inatStatus === 'published') continue
      if (isPendingId(sp.specimenId)) continue // never queue a find without an ID
      await setStatus(id, { inatStatus: 'queued', inatError: undefined })
    }
    runQueue()
  }
  async function retry(id: string) {
    const sp = await useDb().specimens.get(id)
    if (!sp || isPendingId(sp.specimenId)) return
    await setStatus(id, { inatStatus: 'queued', inatError: undefined })
    runQueue()
  }
  async function setGeoprivacy(id: string, geoprivacy: Geoprivacy) {
    await setStatus(id, { geoprivacy })
  }
  const observationUrl = (obsId?: number) => (obsId ? `https://www.inaturalist.org/observations/${obsId}` : '')

  return { connected, inatLogin, running, statusChecked, online, signedIn, queue, retry, setGeoprivacy, refreshStatus, runQueue, observationUrl }
}
