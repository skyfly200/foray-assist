// Record sync between nearby devices (roadmap Phase 13, tier 2). When two phones meet they
// swap inventories (row id + updatedAt), ask for what they lack, and relay what they hold, so a
// crowd converges with nobody online. Merging needs no coordination because every record has
// a globally unique author ID and only its author changes it; each record carries the author
// device's signature, so a relaying phone can't alter or forge it.
// Pure module: erasable TypeScript, unit-tested under plain Node.
import { fromB64, sign, toB64, utf8, verify, type DeviceKey, type KeyLookup } from './crypto.ts'

export interface MeshRecord {
  v: 1
  id: string // author's row uuid
  forayId: string
  specimenId: string
  authorName: string
  timestamp: string
  latitude?: number
  longitude?: number
  geoprivacy: 'open' | 'obscured' | 'private'
  fieldNotes: Record<string, string>
  updatedAt: string
  keyId: string
  sig?: string // base64 ECDSA signature over canonical()
}

export interface LocalFind {
  id: string
  forayId: string
  specimenId: string
  timestamp: string
  latitude?: number
  longitude?: number
  geoprivacy: 'open' | 'obscured' | 'private'
  fieldNotes: Record<string, string | undefined>
  updatedAt: string
}

const obscure = (v: number | undefined) => (v == null ? undefined : Math.floor(v / 0.2) * 0.2 + 0.1)

/** The author's own find as a record, with its location setting applied before it leaves. */
export function recordFromFind(f: LocalFind, authorName: string, keyId: string): MeshRecord {
  const notes: Record<string, string> = {}
  for (const [k, v] of Object.entries(f.fieldNotes ?? {})) if (typeof v === 'string' && v) notes[k] = v
  return {
    v: 1,
    id: f.id,
    forayId: f.forayId,
    specimenId: f.specimenId,
    authorName,
    timestamp: f.timestamp,
    latitude: f.geoprivacy === 'open' ? f.latitude : f.geoprivacy === 'obscured' ? obscure(f.latitude) : undefined,
    longitude: f.geoprivacy === 'open' ? f.longitude : f.geoprivacy === 'obscured' ? obscure(f.longitude) : undefined,
    geoprivacy: f.geoprivacy,
    fieldNotes: notes,
    updatedAt: f.updatedAt,
    keyId,
  }
}

/** Deterministic bytes that the signature covers (fixed key order, sorted notes). */
export function canonical(r: MeshRecord): Uint8Array {
  const notes = Object.keys(r.fieldNotes).sort().map((k) => [k, r.fieldNotes[k]])
  return utf8(JSON.stringify([r.v, r.id, r.forayId, r.specimenId, r.authorName, r.timestamp, r.latitude ?? null,
    r.longitude ?? null, r.geoprivacy, notes, r.updatedAt, r.keyId]))
}

export async function signRecord(r: MeshRecord, device: DeviceKey): Promise<MeshRecord> {
  if (r.keyId !== device.keyId) throw new Error('records are signed by their author device')
  return { ...r, sig: toB64(await sign(device, canonical(r))) }
}

export async function verifyRecord(r: MeshRecord, lookup: KeyLookup): Promise<boolean> {
  if (!r || r.v !== 1 || !r.sig || typeof r.id !== 'string' || typeof r.keyId !== 'string') return false
  const pub = await lookup(r.keyId)
  if (!pub) return false
  try {
    return await verify(pub, fromB64(r.sig), canonical(r))
  } catch {
    return false
  }
}

export type Inventory = Array<[id: string, updatedAt: string]>

export function inventory(records: Array<{ id: string; updatedAt: string }>): Inventory {
  return records.map((r) => [r.id, r.updatedAt] as [string, string])
}

/** Ids in `theirs` that `mine` lacks or holds an older copy of. */
export function wanted(mine: Inventory, theirs: Inventory): string[] {
  const have = new Map(mine)
  return theirs.filter(([id, at]) => { const h = have.get(id); return h === undefined || h < at }).map(([id]) => id)
}

export type Verdict = 'new' | 'newer' | 'stale' | 'own' | 'conflict'

/**
 * Decide what to do with a verified incoming record. Our own finds are never overwritten
 * from outside; a record that reuses a specimen ID under a different row is refused.
 */
export function judge(
  rec: MeshRecord,
  held: Map<string, { updatedAt: string; specimenId: string }>,
  ownRowIds: Set<string>,
  specimenIndex: Map<string, string>,
): Verdict {
  if (ownRowIds.has(rec.id)) return 'own'
  const sidOwner = rec.specimenId ? specimenIndex.get(rec.specimenId) : undefined
  if (sidOwner && sidOwner !== rec.id) return 'conflict'
  const cur = held.get(rec.id)
  if (!cur) return 'new'
  return cur.updatedAt < rec.updatedAt ? 'newer' : 'stale'
}
