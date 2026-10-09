// Share a single find with someone nearby (roadmap Phase 13, "share a single find"): the find,
// its photos and voice notes packed into one file that travels by the Android share sheet
// (Nearby Share, Quick Share, Bluetooth, messaging) or any file transfer. The receiver previews
// it and decides; it is stored as someone else's find and never overwrites their own records.
// The find itself is a signed mesh record (utils/mesh/records.ts), so the same author check
// applies whether it came by file or over the mesh.
// Pure module: erasable TypeScript, unit-tested under plain Node.
import { fromB64, toB64 } from './mesh/crypto.ts'
import type { MeshRecord } from './mesh/records.ts'

export const PACKAGE_FORMAT = 'foray-assist/find'
export const PACKAGE_VERSION = 1
export const PACKAGE_EXT = '.forayfind'
export const MAX_PACKAGE_BYTES = 60 * 1024 * 1024

export interface PackagePhoto { id: string; mimeType: string; capturedAt: string; data: string }
export interface PackageVoice { id: string; transcript: string; model: string; at: string; mimeType?: string; data?: string }

export interface FindPackage {
  format: typeof PACKAGE_FORMAT
  version: number
  exportedAt: string
  record: MeshRecord
  photos: PackagePhoto[]
  voiceNotes: PackageVoice[]
}

export function bytesToB64(b: Uint8Array) { return toB64(b) }
export function b64ToBytes(s: string) { return fromB64(s) }

export function buildPackage(record: MeshRecord, photos: PackagePhoto[], voiceNotes: PackageVoice[], now = new Date()): FindPackage {
  // A private find travels without photos' locations: the record already has none, and the
  // photos are stripped of EXIF by the caller (utils/jpeg.ts) before packing.
  return { format: PACKAGE_FORMAT, version: PACKAGE_VERSION, exportedAt: now.toISOString(), record, photos, voiceNotes }
}

export function packageFileName(p: FindPackage): string {
  const id = p.record.specimenId ? `${p.record.specimenId.slice(0, 4)}-${p.record.specimenId.slice(4, 8)}-${p.record.specimenId.slice(8)}` : 'pending'
  return `find-${id}${PACKAGE_EXT}`
}

const isStr = (v: unknown): v is string => typeof v === 'string'

/** Throws a readable error for anything that isn't a find package this app can read. */
export function parsePackage(text: string): FindPackage {
  if (text.length > MAX_PACKAGE_BYTES * 1.4) throw new Error('This file is too big to be a shared find.')
  let p: any
  try { p = JSON.parse(text) } catch { throw new Error("This file isn't a shared find.") }
  if (!p || p.format !== PACKAGE_FORMAT) throw new Error("This file isn't a shared find.")
  if (p.version !== PACKAGE_VERSION) throw new Error('This find was shared from a newer version of the app. Update the app to open it.')
  const r = p.record
  if (!r || r.v !== 1 || !isStr(r.id) || !isStr(r.forayId) || !isStr(r.specimenId) || !isStr(r.timestamp) || !isStr(r.updatedAt)
      || !['open', 'obscured', 'private'].includes(r.geoprivacy) || typeof r.fieldNotes !== 'object' || r.fieldNotes === null) {
    throw new Error('The find in this file is incomplete.')
  }
  const photos = Array.isArray(p.photos) ? p.photos : []
  const voice = Array.isArray(p.voiceNotes) ? p.voiceNotes : []
  for (const ph of photos) {
    if (!isStr(ph.id) || !isStr(ph.data) || !/^image\//.test(ph.mimeType)) throw new Error('A photo in this file is damaged.')
  }
  for (const v of voice) {
    if (!isStr(v.id) || !isStr(v.transcript)) throw new Error('A voice note in this file is damaged.')
    if (v.data != null && (!isStr(v.data) || !/^audio\//.test(v.mimeType ?? ''))) throw new Error('A voice note in this file is damaged.')
  }
  return { format: PACKAGE_FORMAT, version: PACKAGE_VERSION, exportedAt: String(p.exportedAt ?? ''), record: r, photos, voiceNotes: voice }
}

export type ImportVerdict =
  | { ok: true; replace: boolean }
  | { ok: false; reason: string }

/**
 * Whether to accept a received find. Our own finds are never overwritten; a find already
 * held is replaced only by a newer copy; a specimen ID already used by another row is refused.
 */
export function judgeImport(
  rec: MeshRecord,
  ownRowIds: Set<string>,
  ownSpecimenIds: Set<string>,
  held: Map<string, { updatedAt: string; specimenId: string }>,
  heldSpecimenIds: Map<string, string>,
): ImportVerdict {
  if (ownRowIds.has(rec.id) || (rec.specimenId && ownSpecimenIds.has(rec.specimenId))) return { ok: false, reason: 'This is one of your own finds.' }
  const other = rec.specimenId ? heldSpecimenIds.get(rec.specimenId) : undefined
  if (other && other !== rec.id) return { ok: false, reason: 'You already have a different find with this ID.' }
  const cur = held.get(rec.id)
  if (!cur) return { ok: true, replace: false }
  if (cur.updatedAt >= rec.updatedAt) return { ok: false, reason: 'You already have this find (same or newer copy).' }
  return { ok: true, replace: true }
}
