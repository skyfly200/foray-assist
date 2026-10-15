// Photos and recordings made on another device arrive as rows only; their images and
// audio download the first time something needs them, then stay on this device. This
// keeps a second phone from filling up with every photo the account ever took.
import type { Photo, VoiceNote } from '~/utils/db'

const MEDIA_BUCKET = 'foray-media'
/** After a failed download (offline, not uploaded yet), wait this long before trying the same file again. */
const RETRY_AFTER_MS = 30_000

const inflight = new Map<string, Promise<Blob | null>>()
const failedAt = new Map<string, number>()

async function download(path: string): Promise<Blob | null> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return null
  const cfg: any = useRuntimeConfig().public
  if (!cfg?.syncConfigured) return null
  const { data, error } = await useSupabaseClient().storage.from(MEDIA_BUCKET).download(path)
  return error || !(data instanceof Blob) ? null : data
}

function fetchOnce(key: string, path: string, save: (b: Blob) => Promise<unknown>): Promise<Blob | null> {
  const hit = inflight.get(key)
  if (hit) return hit
  if (Date.now() - (failedAt.get(key) ?? 0) < RETRY_AFTER_MS) return Promise.resolve(null)
  const p = download(path)
    .then(async (b) => {
      if (!b) { failedAt.set(key, Date.now()); return null }
      failedAt.delete(key)
      await save(b)
      return b
    })
    .catch(() => { failedAt.set(key, Date.now()); return null })
    .finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

/** The photo's image, downloading and keeping it if it was taken on another device. null if it can't be had right now. */
export function ensurePhotoBlob(p: Photo): Promise<Blob | null> {
  if (p.blob instanceof Blob) return Promise.resolve(p.blob)
  if (!p.storagePath) return Promise.resolve(null)
  // Saving the blob doesn't change updatedAt, so it is not an edit and isn't uploaded again.
  return fetchOnce('p:' + p.id, p.storagePath, (blob) => useDb().photos.update(p.id, { blob }))
}

/** The note's audio, downloading and keeping it if it was recorded on another device. */
export function ensureVoiceAudio(n: VoiceNote): Promise<Blob | null> {
  if (n.audio instanceof Blob) return Promise.resolve(n.audio)
  if (!n.storagePath) return Promise.resolve(null)
  return fetchOnce('v:' + n.id, n.storagePath, (audio) => useDb().voiceNotes.update(n.id, { audio }))
}

/** Same as ensurePhotoBlob, but throws a plain-language error when the image can't be fetched. */
export async function requirePhotoBlob(p: Photo): Promise<Blob> {
  const b = await ensurePhotoBlob(p)
  if (!b) throw new Error('A photo from another device has not downloaded yet. Connect to the internet and try again.')
  return b
}
