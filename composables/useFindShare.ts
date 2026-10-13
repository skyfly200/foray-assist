// Share one find with someone nearby as a file (roadmap Phase 13). On Android the share sheet
// offers Nearby Share / Quick Share, Bluetooth and messaging apps; elsewhere the file downloads.
// The receiver opens it from the foray screen, previews it and decides; it is stored as
// someone else's find (peerFinds) and never touches their own records.
import { buildPackage, judgeImport, packageFileName, parsePackage, PACKAGE_EXT, type FindPackage } from '~/utils/findPackage'
import { toB64 } from '~/utils/mesh/crypto'
import { recordFromFind, signRecord, verifyRecord } from '~/utils/mesh/records'
import { stripPhotoBlob } from '~/utils/jpeg'
import type { Foray, PeerFindRow, Specimen } from '~/utils/db'
import { getDeviceKey, keyLookupFor, memberNameFor } from './useDeviceKey'
import { getDisplayName } from './useSharedForay'

async function blobB64(b: Blob): Promise<string> {
  return toB64(new Uint8Array(await b.arrayBuffer()))
}

export async function buildFindFile(find: Specimen): Promise<File> {
  const db = useDb()
  const dev = await getDeviceKey()
  const name = (await getDisplayName()) || 'A forager'
  const record = await signRecord(recordFromFind({ ...find, fieldNotes: find.fieldNotes as Record<string, string | undefined> }, name, dev.keyId), dev)
  // Photos travel without EXIF, so a private find's photos don't reveal where it was.
  const photos = await db.photos.where('specimenRowId').equals(find.id).toArray()
  const voice = await db.voiceNotes.where('specimenRowId').equals(find.id).toArray()
  const pkg = buildPackage(
    record,
    await Promise.all(photos.map(async (p) => ({ id: p.id, mimeType: p.mimeType, capturedAt: p.capturedAt, data: await blobB64(await stripPhotoBlob(p.blob)) }))),
    await Promise.all(voice.map(async (v) => ({
      id: v.id, transcript: v.transcript, model: v.model, at: v.at,
      ...(v.audio ? { mimeType: v.audio.type || 'audio/webm', data: await blobB64(v.audio) } : {}),
    }))),
  )
  return new File([JSON.stringify(pkg)], packageFileName(pkg), { type: 'application/json' })
}

/** Returns how it went out: the share sheet, or a download. */
export async function shareFind(find: Specimen): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = await buildFindFile(find)
  const nav: any = typeof navigator !== 'undefined' ? navigator : null
  if (nav?.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'A find from my foray', text: 'Open this in Foray Assist (foray screen, Open a shared find).' })
      return 'shared'
    } catch (e: any) {
      if (e?.name === 'AbortError') return 'cancelled'
      // fall through to download
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}

export interface ImportPreview {
  pkg: FindPackage
  /** True when the sender's device key is known (a member of this foray) and the signature checks out. */
  verified: boolean
  senderName: string
  ok: boolean
  reason?: string
  replace: boolean
  photoUrls: string[]
}

export const FIND_FILE_ACCEPT = `${PACKAGE_EXT},application/json,.json`

export async function previewFindFile(file: File, foray: Foray): Promise<ImportPreview> {
  const pkg = parsePackage(await file.text())
  const db = useDb()
  const [own, peers] = await Promise.all([db.specimens.toArray(), db.peerFinds.toArray()])
  const verified = await verifyRecord(pkg.record, keyLookupFor(foray))
  const j = judgeImport(
    pkg.record,
    new Set(own.map((s) => s.id)),
    new Set(own.map((s) => s.specimenId).filter(Boolean)),
    new Map(peers.map((p) => [p.id, p])),
    new Map(peers.filter((p) => p.specimenId).map((p) => [p.specimenId, p.id])),
  )
  const photoUrls = pkg.photos.slice(0, 6).map((p) => `data:${p.mimeType};base64,${p.data}`)
  return {
    pkg,
    verified,
    senderName: memberNameFor(foray, pkg.record.keyId) ?? pkg.record.authorName ?? 'Someone',
    ok: j.ok,
    reason: j.ok ? undefined : j.reason,
    replace: j.ok ? j.replace : false,
    photoUrls,
  }
}

const b64Blob = (data: string, type: string) => {
  const s = atob(data)
  const u = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i)
  return new Blob([u], { type })
}

/** Store an approved find in this foray as someone else's find. */
export async function acceptFindFile(preview: ImportPreview, forayId: string): Promise<void> {
  if (!preview.ok) throw new Error(preview.reason ?? 'This find cannot be added.')
  const r = preview.pkg.record
  const row: PeerFindRow = {
    id: r.id,
    forayId, // shown in the foray it was opened in
    source: 'file',
    authorName: preview.senderName,
    specimenId: r.specimenId,
    timestamp: r.timestamp,
    latitude: r.latitude,
    longitude: r.longitude,
    geoprivacy: r.geoprivacy,
    fieldNotes: {
      ...r.fieldNotes,
      ...(preview.pkg.voiceNotes.length ? { voiceTranscripts: preview.pkg.voiceNotes.map((v) => v.transcript).filter(Boolean).join('\n') } : {}),
    },
    photos: preview.pkg.photos.map((p) => ({ id: p.id, capturedAt: p.capturedAt, mimeType: p.mimeType, blob: b64Blob(p.data, p.mimeType) })),
    updatedAt: r.updatedAt,
    receivedAt: nowIso(),
    // Relay it over the mesh only within the foray it was made in (the signature covers that).
    ...(r.forayId === forayId ? { record: r } : {}),
  }
  await useDb().peerFinds.put(row)
}
