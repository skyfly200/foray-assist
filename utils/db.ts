// Local database: the source of truth for the app (see SPEC §4).
// Every row has a client-generated UUID `id` and an ISO `updatedAt`.
// Supabase is only a sync target; nothing in the field depends on it.
import Dexie, { type Table } from 'dexie'
import type { PeerFind } from './sharing'
import type { MeshRecord } from './mesh/records'

/** Someone else's find, stored read-only; `record` is the signed copy when it came by file or mesh. */
export type PeerFindRow = PeerFind & { record?: MeshRecord }

export type Geoprivacy = 'open' | 'obscured' | 'private'

export interface ForayMember {
  userId: string
  displayName: string
  role: 'owner' | 'leader' | 'member'
  leftAt?: string | null
  keys: Array<{ device_id: string; key_id: string; public_key: string }>
}

/** Set once a foray is shared (owner) or joined (member); see composables/useSharedForay.ts. */
export interface SharedInfo {
  role: 'owner' | 'leader' | 'member'
  joinCode?: string | null
  /** base64 32-byte key for nearby sharing (Phase 13), from the server. */
  meshKey?: string
  societyName?: string | null
  ownerName?: string | null
  members?: ForayMember[]
  refreshedAt?: string
}

export interface Foray {
  id: string
  name: string
  startedAt: string
  endedAt?: string
  updatedAt: string
  /** Local-only (never synced as a column). Absent for a private, unshared foray. */
  shared?: SharedInfo
  /** Local-only: someone else started this foray and we joined it, so we never write its row. */
  joined?: boolean
}

export interface FieldNotes {
  speciesGuess?: string
  substrate?: string
  hostTree?: string
  odor?: string
  capTexture?: string
  staining?: string
  notes?: string
}

export interface Specimen {
  id: string // uuid (primary key)
  specimenId: string // '' = ID pending; otherwise e.g. B7QM4T9RX shown as B7QM-4T9R-X (see utils/idCode.ts)
  forayId: string
  timestamp: string
  latitude?: number
  longitude?: number
  geoprivacy: Geoprivacy
  fieldNotes: FieldNotes
  iNatObservationId?: number
  inatStatus?: 'draft' | 'queued' | 'published' | 'failed'
  inatError?: string
  printedLabelAt?: string
  /** Society voucher number (U-Z class ID from a preprinted society sheet), if any. */
  voucherId?: string
  updatedAt: string
  syncedAt?: string
}

export interface Photo {
  id: string
  /** Specimen.id, or '' while the photo is imported but not yet assigned to a find (Review Mode clustering assigns it). */
  specimenRowId: string
  forayId: string
  /** Stable id from the origin (e.g. Google Photos media id, or file name+size+mtime) to dedupe re-imports. */
  externalId?: string
  width?: number
  height?: number
  source: 'capture' | 'picker' | 'google-photos'
  blob: Blob
  mimeType: string
  capturedAt: string
  latitude?: number
  longitude?: number
  blurScore?: number
  isSelected: boolean
  updatedAt: string
  syncedAt?: string
}

export interface VoiceNote {
  id: string
  specimenRowId?: string // optional: a note may belong to the foray as a whole
  forayId: string
  audio?: Blob
  transcript: string
  model: string // e.g. 'web-speech', 'whisper-tiny.en'
  at: string
  updatedAt: string
  syncedAt?: string
}

/** A comment, ID suggestion or agreement on a find in a shared foray (Phase 12). */
export interface FindComment {
  id: string
  forayId: string
  specimenRowId: string
  kind: 'comment' | 'suggestion' | 'agree'
  body: string
  taxon?: string
  /** Local-only: who wrote it, for display. Our own comments have mine = 1. */
  authorName: string
  userId?: string
  mine: 0 | 1
  createdAt: string
  updatedAt: string
  syncedAt?: string
}

/** Alerts heard nearby (Phase 13), kept for the session's "finds near you" summary. */
export interface NearbyAlert {
  key: string // forayId + specimenId
  forayId: string
  specimenId: string
  latitude?: number
  longitude?: number
  precisionM?: number
  species: string
  at: string
  keyId: string
  authorName?: string
  heardAt: string
}

export type OutboxTable = 'forays' | 'specimens' | 'photos' | 'voiceNotes' | 'comments'

export interface OutboxItem {
  id?: number // auto-increment
  table: OutboxTable
  rowId: string
  op: 'upsert' | 'delete'
  createdAt: string
  attempts: number
  lastError?: string
  nextAttemptAt?: string // ISO; not due before this (persisted backoff)
  parkedAt?: string // ISO; set => parked, skipped by the drain
}

// Known settings keys: 'mode' ('foray'|'review'), 'idSets' (this device's stock of reserved ID sets, see utils/idStock.ts), 'deviceId',
// 'whisperModel' ('tiny.en'|'base.en'), 'printer' (last used printer info), 'displayName' (name shown to
// foray members), 'societies' (cached my_societies() rows), 'societySets' (voucher sets this device claimed),
// 'deviceKey' ({ privateKey, publicKey } CryptoKeys for signing, Phase 13), 'deviceKeyPublished' (key id sent
// to the server), 'nearbyEnabled' (opt-in for nearby alerts).
export interface Setting {
  key: string
  value: unknown
}

class ForayDB extends Dexie {
  forays!: Table<Foray, string>
  specimens!: Table<Specimen, string>
  photos!: Table<Photo, string>
  voiceNotes!: Table<VoiceNote, string>
  outbox!: Table<OutboxItem, number>
  settings!: Table<Setting, string>
  peerFinds!: Table<PeerFindRow, string>
  comments!: Table<FindComment, string>
  nearbyAlerts!: Table<NearbyAlert, string>

  constructor() {
    super('forray-assist')
    this.version(1).stores({
      forays: 'id, startedAt, updatedAt',
      specimens: 'id, specimenId, forayId, timestamp, updatedAt',
      photos: 'id, specimenRowId, forayId, capturedAt',
      voiceNotes: 'id, specimenRowId, forayId, at',
      outbox: '++id, table, rowId, createdAt',
      settings: 'key',
    })
    this.version(2).stores({
      specimens: 'id, specimenId, forayId, timestamp, updatedAt, inatStatus',
      photos: 'id, specimenRowId, forayId, capturedAt, externalId',
    })
    // v3: shared forays and societies (Phase 12), nearby sharing (Phase 13).
    this.version(3).stores({
      specimens: 'id, specimenId, forayId, timestamp, updatedAt, inatStatus, voucherId',
      peerFinds: 'id, forayId, specimenId, source, timestamp',
      comments: 'id, forayId, specimenRowId, createdAt',
      nearbyAlerts: 'key, forayId, heardAt',
    })
  }
}

let _db: ForayDB | null = null
/** Lazily created so nothing touches IndexedDB at import/SSR time. */
export function useDb(): ForayDB {
  if (!_db) _db = new ForayDB()
  return _db
}

export const nowIso = () => new Date().toISOString()
export const newId = () => crypto.randomUUID()

/** Queue a row for sync. Call inside the same transaction as the write when possible. */
export async function enqueue(table: OutboxTable, rowId: string, op: 'upsert' | 'delete' = 'upsert') {
  await useDb().outbox.add({ table, rowId, op, createdAt: nowIso(), attempts: 0 })
}
