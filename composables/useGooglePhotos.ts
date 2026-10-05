// Client side of the Google Photos Picker import. Optional: nothing else in the app depends on it.
import { computed, ref } from 'vue'
import { enqueue, newId, nowIso, useDb, type Photo } from '~/utils/db'

export interface GoogleStatus { configured: boolean; connected: boolean; scopeOk: boolean }
interface PickedMeta { id: string; createTime?: string; filename?: string; mimeType?: string; width?: number; height?: number; latitude?: number; longitude?: number }

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

  /** Runs the whole picker flow. Returns counts. Call from a click handler (popup needs a user gesture). */
  async function pickAndImport(forayId: string, opts: { limitToForayWindow?: boolean } = {}) {
    error.value = ''; pickerUrl.value = ''; cancelled = false
    const result = { imported: 0, duplicates: 0, outsideWindow: 0, failed: 0 }
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

      const db = useDb()
      const foray = await db.forays.get(forayId)
      const from = foray ? new Date(foray.startedAt).getTime() : NaN
      const to = foray?.endedAt ? new Date(foray.endedAt).getTime() : NaN

      phase.value = 'downloading'
      progress.value = { done: 0, total: items.length }
      for (const m of items) {
        if (cancelled) break
        try {
          if (await db.photos.where('externalId').equals(m.id).first()) { result.duplicates++; continue }
          const t = m.createTime ? new Date(m.createTime).getTime() : NaN
          if (opts.limitToForayWindow && foray?.endedAt && Number.isFinite(t) && (t < from || t > to)) { result.outsideWindow++; continue }
          const blob = await apiFetch<Blob>(`/api/google/media/${encodeURIComponent(m.id)}?session=${encodeURIComponent(s.id)}`, { responseType: 'blob' })
          const dims = await imageSize(blob)
          const id = newId()
          const photo: Photo = {
            id, specimenRowId: '', forayId, externalId: m.id,
            width: dims.width ?? m.width, height: dims.height ?? m.height,
            source: 'google-photos', blob, mimeType: blob.type || m.mimeType || 'image/jpeg',
            capturedAt: m.createTime || nowIso(),
            latitude: m.latitude, longitude: m.longitude,
            isSelected: false, updatedAt: nowIso(),
          }
          await db.transaction('rw', db.photos, db.outbox, async () => { await db.photos.add(photo); await enqueue('photos', id) })
          result.imported++
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

  return { status, connected, busy, phase, progress, error, pickerUrl, refreshStatus, connect, disconnect, pickAndImport, cancel }
}
