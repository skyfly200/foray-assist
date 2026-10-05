// Read capture time + GPS from an image File/Blob. Never throws.
export interface PhotoMeta {
  capturedAt: string // ISO
  latitude?: number
  longitude?: number
  /** where the timestamp came from */
  timeSource: 'exif' | 'file'
}

export async function readPhotoMeta(file: File | Blob): Promise<PhotoMeta> {
  const fallbackMs = (file as File).lastModified || Date.now()
  let time: Date | undefined
  let latitude: number | undefined
  let longitude: number | undefined
  try {
    const exifr: any = await import('exifr')
    const lib = exifr.default ?? exifr
    const tags = await lib.parse(file, { gps: true, pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate', 'latitude', 'longitude'] })
    const d = tags?.DateTimeOriginal ?? tags?.CreateDate ?? tags?.ModifyDate
    if (d instanceof Date && !Number.isNaN(d.getTime())) time = d
    if (typeof tags?.latitude === 'number' && typeof tags?.longitude === 'number' && Number.isFinite(tags.latitude) && Number.isFinite(tags.longitude)) {
      latitude = tags.latitude
      longitude = tags.longitude
    }
  } catch {
    /* no/invalid EXIF: fall back below */
  }
  return {
    capturedAt: (time ?? new Date(fallbackMs)).toISOString(),
    timeSource: time ? 'exif' : 'file',
    ...(latitude !== undefined && longitude !== undefined ? { latitude, longitude } : {}),
  }
}
