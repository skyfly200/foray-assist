// Shared foray helpers (roadmap Phase 12): join codes, join links, and mapping the server's
// foray feed into local "peer find" rows. Pure module: erasable TypeScript, unit-tested under
// plain Node.
import { ID_ALPHABET } from './idCode.ts'

export const JOIN_CODE_LENGTH = 8

/** Upper-case, drop spaces/dashes. Returns null unless it is 8 characters from the ID alphabet. */
export function normalizeJoinCode(input: string): string | null {
  const s = String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (s.length !== JOIN_CODE_LENGTH) return null
  return [...s].every((c) => ID_ALPHABET.includes(c)) ? s : null
}

/** Display form XXXX-XXXX. */
export function formatJoinCode(code: string): string {
  const c = normalizeJoinCode(code) ?? String(code ?? '')
  return c.length === JOIN_CODE_LENGTH ? `${c.slice(0, 4)}-${c.slice(4)}` : c
}

/** The link a QR code carries: opening it on a phone goes straight to the join screen. */
export function joinUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}/join/${normalizeJoinCode(code) ?? code}`
}

/** Accepts a typed code, "XXXX-XXXX", or a scanned join link. */
export function parseJoinInput(input: string): string | null {
  const s = String(input ?? '').trim()
  const m = s.match(/\/join\/([A-Za-z0-9-]+)\/?(?:[?#].*)?$/)
  return normalizeJoinCode(m ? m[1]! : s)
}

export type PeerSource = 'server' | 'file' | 'mesh'

export interface PeerPhoto {
  id: string
  storagePath?: string
  isSelected?: boolean
  capturedAt?: string
  /** Present for finds received as a file or over the mesh. */
  blob?: Blob
  mimeType?: string
}

/** Someone else's find: read-only on this device, never synced as our own. */
export interface PeerFind {
  id: string // the author's row uuid
  forayId: string
  source: PeerSource
  userId?: string
  authorName: string
  specimenId: string
  voucherId?: string
  timestamp: string
  latitude?: number
  longitude?: number
  geoprivacy: 'open' | 'obscured' | 'private'
  fieldNotes: Record<string, string>
  photos: PeerPhoto[]
  updatedAt: string
  receivedAt: string
}

export interface FeedRow {
  id: string
  user_id: string
  author_name: string | null
  specimen_id: string
  voucher_id: string | null
  timestamp: string
  latitude: number | null
  longitude: number | null
  geoprivacy: 'open' | 'obscured' | 'private'
  field_notes: Record<string, string> | null
  updated_at: string
  photos: Array<{ id: string; storage_path: string; is_selected: boolean; captured_at: string }> | null
}

export function feedRowToPeerFind(row: FeedRow, forayId: string, receivedAt: string): PeerFind {
  return {
    id: row.id,
    forayId,
    source: 'server',
    userId: row.user_id,
    authorName: row.author_name || 'A member',
    specimenId: row.specimen_id ?? '',
    voucherId: row.voucher_id ?? undefined,
    timestamp: row.timestamp,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    geoprivacy: row.geoprivacy,
    fieldNotes: row.field_notes ?? {},
    photos: (row.photos ?? []).map((p) => ({ id: p.id, storagePath: p.storage_path, isSelected: p.is_selected, capturedAt: p.captured_at })),
    updatedAt: row.updated_at,
    receivedAt,
  }
}

/**
 * Replace the server-sourced peer finds of one foray with a fresh feed. Finds that came by file
 * or mesh are kept unless the server now has the same row (the server copy wins). Rows by
 * `selfUserId` are dropped: our own finds live in the specimens table.
 */
export function mergeFeed(existing: PeerFind[], feed: PeerFind[], selfUserId: string | null): PeerFind[] {
  const fresh = feed.filter((f) => f.userId !== selfUserId)
  const ids = new Set(fresh.map((f) => f.id))
  const keep = existing.filter((f) => f.source !== 'server' && !ids.has(f.id))
  return [...fresh, ...keep].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
}

/** "Amanita muscaria (2), Boletus edulis" style summary of suggestions on one find. */
export function summarizeSuggestions(comments: Array<{ kind: string; taxon?: string | null }>): Array<{ taxon: string; votes: number }> {
  const tally = new Map<string, number>()
  for (const c of comments) {
    const t = (c.taxon ?? '').trim()
    if (!t || (c.kind !== 'suggestion' && c.kind !== 'agree')) continue
    tally.set(t, (tally.get(t) ?? 0) + 1)
  }
  return [...tally].map(([taxon, votes]) => ({ taxon, votes })).sort((a, b) => b.votes - a.votes || a.taxon.localeCompare(b.taxon))
}

/** A society voucher number: a valid 9-character ID in the society class (U-Z). */
export function isSocietyClass(id: string): boolean {
  return /^[U-Z]/.test(String(id ?? '').toUpperCase())
}
