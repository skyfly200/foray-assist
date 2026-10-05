// Local database: the source of truth for the app (see SPEC §4).
// Every row has a client-generated UUID `id` and an ISO `updatedAt`.
// Supabase is only a sync target; nothing in the field depends on it.
import Dexie, { type Table } from 'dexie'

export type Geoprivacy = 'open' | 'obscured' | 'private'

export interface Foray {
  id: string
  name: string
  startedAt: string
  endedAt?: string
  updatedAt: string
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
  specimenId: string // human-readable, e.g. FORAY-20261005-K7-001
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

export type OutboxTable = 'forays' | 'specimens' | 'photos' | 'voiceNotes'

export interface OutboxItem {
  id?: number // auto-increment
  table: OutboxTable
  rowId: string
  op: 'upsert' | 'delete'
  createdAt: string
  attempts: number
  lastError?: string
}

// Known settings keys: 'mode' ('foray'|'review'), 'deviceTag', 'seq:YYYYMMDD',
// 'whisperModel' ('tiny.en'|'base.en'), 'printer' (last used printer info).
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
