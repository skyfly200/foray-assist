// Client side of the Google Photos Picker import. Optional: nothing else in the app depends on it.
import { computed, ref } from 'vue'
import { enqueue, newId, nowIso, useDb, type Photo } from '~/utils/db'
import { readPhotoMeta } from '~/utils/exif'

export interface GoogleStatus { configured: boolean; connected: boolean; scopeOk: boolean }
export interface PickedMeta { id: string; createTime?: string; filename?: string; mimeType?: string; width?: number; height?: number; latitude?: number; longitude?: number }

async function imageSize(blob: Blob): Promise<{ width?: number; height?: number }> {
  try {
    const bmp = await createImageBitmap(blob)
    const r = { width: bmp.width, height: bmp.height }
    bmp.close?.()
    return r
  } catch {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob)
      const img = new Image()
      img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url) }
      img.onerror = () => { resolve({}); URL.revokeObjectURL(url) }
      img.src = url
    })
  }
}

export interface PickedGooglePhoto { meta: PickedMeta; blob: Blob; width?: number; height?: number }

/** Google's own time and place for a picked photo, falling back to the file's EXIF. */
export async function googlePhotoStamp(p: PickedGooglePhoto) {
  const exif = await readPhotoMeta(p.blob)
  const t = p.meta.createTime && Number.isFinite(Date.parse(p.meta.createTime)) ? p.meta.createTime : undefined
  const lat = p.meta.latitude ?? exif.latitude
  const lon = p.meta.longitude ?? exif.longitude
  return {
    capturedAt: t ?? exif.capturedAt,
    timeSource: t ? ('exif' as const) : exif.timeSource,
    ...(lat !== undefined && lon !== undefined ? { latitude: lat, longitude: lon } : {}),
  }
}

/** Saves downloaded picks as unsorted photos in a foray, skipping ones already imported. */
export async function saveGooglePhotos(forayId: string, photos: PickedGooglePhoto[]) {
  const db = useDb()
  const result = { imported: 0, duplicates: 0, failed: 0 }
  for (const p of photos) {
    try {
      if (await db.photos.where('externalId').equals(p.meta.id).first()) { result.duplicates++; continue }
      const stamp = await googlePhotoStamp(p)
      const id = newId()
      const photo: Photo = {
        id, specimenRowId: '', forayId, externalId: p.meta.id,
        width: p.width ?? p.meta.width, height: p.height ?? p.meta.height,
        source: 'google-photos', blob: p.blob, mimeType: p.blob.type || p.meta.mimeType || 'image/jpeg',
        capturedAt: stamp.capturedAt,
        latitude: stamp.latitude, longitude: stamp.longitude,
        isSelected: false, updatedAt: nowIso(),
      }
      await db.transaction('rw', db.photos, db.outbox, async () => { await db.photos.add(photo); await enqueue('photos', id) })
      result.imported++
    } catch { result.failed++ }
  }
  return result
}

export function useGooglePhotos() {
  const status = ref<GoogleStatus | null>(null)
  const busy = ref(false)
  const phase = ref<'idle' | 'waiting' | 'downloading'>('idle')
  const progress = ref({ done: 0, total: 0 })
  const error = ref('')
  const pickerUrl = ref('') // fallback link if the popup was blocked
  let cancelled = false

  const connected = computed(() => !!status.value?.connected && !!status.value?.scopeOk)

  async function refreshStatus() {
    try { status.value = await apiFetch<GoogleStatus>('/api/google/status'); error.value = '' }
    catch (e: any) { status.value = null; error.value = e?.data?.statusMessage || e?.message || 'Could not check Google status' }
  }

  async function connect() {
    try {
      const { url } = await apiFetch<{ url: string }>('/api/google/auth-url')
      window.location.href = url
    } catch (e: any) { error.value = e?.data?.statusMessage || e?.message || 'Could not start Google sign-in' }
  }

  async function disconnect() {
    try { await apiFetch('/api/google/disconnect', { method: 'POST' }); await refreshStatus() }
    catch (e: any) { error.value = e?.data?.statusMessage || e?.message || 'Disconnect failed' }
  }

  function cancel() { cancelled = true }

  /**
   * Opens the Google picker and downloads what was picked, without saving anything. `check` can skip an
   * item before download. Call from a click handler (popup needs a user gesture).
   */
  async function pickAndDownload(check?: (m: PickedMeta) => Promise<'duplicate' | 'outside' | null>) {
    error.value = ''; pickerUrl.value = ''; cancelled = false
    const result = { photos: [] as PickedGooglePhoto[], duplicates: 0, outsideWindow: 0, failed: 0 }
    busy.value = true
    // Open the tab synchronously so popup blockers allow it, then point it at the picker.
    const win = window.open('', '_blank')
    try {
      const s = await apiFetch<{ id: string; pickerUri: string; pollIntervalMs: number; timeoutMs: number }>('/api/google/picker-session', { method: 'POST' })
      if (win) win.location.href = s.pickerUri
      else pickerUrl.value = s.pickerUri
      phase.value = 'waiting'

      const deadline = Date.now() + s.timeoutMs
      let items: PickedMeta[] | null = null
      let interval = s.pollIntervalMs
      while (!cancelled && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, interval))
        const p = await apiFetch<{ mediaItemsSet: boolean; items: PickedMeta[]; pollIntervalMs: number }>(`/api/google/picker-session/${encodeURIComponent(s.id)}`)
        if (p.mediaItemsSet) { items = p.items; break }
        interval = p.pollIntervalMs || interval
      }
      if (!items) { if (!cancelled) error.value = 'Timed out waiting for your selection'; return result }

      phase.value = 'downloading'
      progress.value = { done: 0, total: items.length }
      for (const m of items) {
        if (cancelled) break
        try {
          const skip = await check?.(m)
          if (skip === 'duplicate') { result.duplicates++; continue }
          if (skip === 'outside') { result.outsideWindow++; continue }
          const blob = await apiFetch<Blob>(`/api/google/media/${encodeURIComponent(m.id)}?session=${encodeURIComponent(s.id)}`, { responseType: 'blob' })
          result.photos.push({ meta: m, blob, ...(await imageSize(blob)) })
        } catch { result.failed++ }
        finally { progress.value = { done: progress.value.done + 1, total: items.length } }
      }
      // Best-effort: tidy up is left to Google's session expiry.
      return result
    } catch (e: any) {
      error.value = e?.data?.statusMessage || e?.message || 'Google Photos import failed'
      return result
    } finally {
      busy.value = false; phase.value = 'idle'
    }
  }

  /** Runs the whole picker flow into a foray. Returns counts. Call from a click handler. */
  async function pickAndImport(forayId: string, opts: { limitToForayWindow?: boolean } = {}) {
    const db = useDb()
    const foray = await db.forays.get(forayId)
    const from = foray ? new Date(foray.startedAt).getTime() : NaN
    const to = foray?.endedAt ? new Date(foray.endedAt).getTime() : NaN
    const r = await pickAndDownload(async (m) => {
      if (await db.photos.where('externalId').equals(m.id).first()) return 'duplicate'
      const t = m.createTime ? new Date(m.createTime).getTime() : NaN
      if (opts.limitToForayWindow && foray?.endedAt && Number.isFinite(t) && (t < from || t > to)) return 'outside'
      return null
    })
    const saved = await saveGooglePhotos(forayId, r.photos)
    return { imported: saved.imported, duplicates: r.duplicates + saved.duplicates, outsideWindow: r.outsideWindow, failed: r.failed + saved.failed }
  }

  return { status, connected, busy, phase, progress, error, pickerUrl, refreshStatus, connect, disconnect, pickAndDownload, pickAndImport, cancel }
}
