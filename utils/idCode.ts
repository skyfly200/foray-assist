// Specimen ID codes (v2): CNNN-SSOO-K, e.g. B7QM-4T9R-X  (9 characters, shown as 4-4-1)
//
//   C    class      first character: says which layout the rest uses (like an IP class)
//   NNN  network    the AUTHOR (a person, or a society): issued by the server at sign-in
//   SS   set        a block of 1,024 IDs owned by ONE device: issued by the server
//   OO   observation 0-1023 within the set: counted up by the owning device
//   K    check      catches any single wrong character and any swap of neighbours
//
// IDs identify the author, never a foray. A shared foray is a separate grouping record, so
// two people adding to one foray can never produce the same ID. Uniqueness is by
// construction: the server hands each network to exactly one person and each set to exactly
// one device, and a device only counts up inside sets it owns.
//
// Alphabet: 32 symbols, no I, O, 0 or 1. Pure module: no imports, erasable TypeScript,
// unit-tested under plain Node.

export const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const SET_SIZE = 1024 // observation numbers 0..1023 per set (2 base-32 chars)
export const SETS_PER_NETWORK = 1024 // set numbers 0..1023 per network

export type IdKind = 'personal' | 'extended' | 'local' | 'society' | 'reserved'

export interface IdClass {
  kind: IdKind
  /** Total length including the check character; null when the layout is not defined yet. */
  length: number | null
  netLen: number
  setLen: number
  obsLen: number
}

const INDEX = new Map<string, number>(ID_ALPHABET.split('').map((c, i) => [c, i]))

/** First-character dispatch (see roadmap Phases 6, 7, 12). Only 'personal' IDs are issued today. */
export function classOf(first: string): IdClass | null {
  const i = INDEX.get(first)
  if (i === undefined) return null
  if (i <= 7) return { kind: 'personal', length: 9, netLen: 3, setLen: 2, obsLen: 2 } // A-H
  if (i <= 12) return { kind: 'extended', length: 12, netLen: 4, setLen: 3, obsLen: 3 } // J-N (reserved)
  if (i <= 17) return { kind: 'local', length: 9, netLen: 3, setLen: 2, obsLen: 2 } // P-T (reserved)
  if (i <= 23) return { kind: 'society', length: 9, netLen: 3, setLen: 2, obsLen: 2 } // U-Z (societies)
  return { kind: 'reserved', length: null, netLen: 0, setLen: 0, obsLen: 0 } // 2-9
}

// ---- check character: Damm-style over GF(32) ---------------------------------------------
// GF(32) = GF(2)[x] / (x^5 + x^2 + 1). Multiplying by 2 (the element x) is a shift plus a
// conditional XOR. The operation c o s = 2*c XOR s is a weakly totally anti-symmetric
// quasigroup, so the final remainder detects every single-symbol error and every
// transposition of adjacent symbols (Damm 2004). Valid codes leave a remainder of 0.
function mul2(v: number): number {
  let m = v << 1
  if (m & 32) m ^= 0b100101
  return m & 31
}

function remainder(symbols: string): number {
  let r = 0
  for (const ch of symbols) {
    const idx = INDEX.get(ch)
    if (idx === undefined) throw new Error(`Invalid ID character: ${ch}`)
    r = mul2(r) ^ idx
  }
  return r
}

/** Check character for a payload (every character except the last). */
export function checkChar(payload: string): string {
  return ID_ALPHABET[mul2(remainder(payload))]!
}

export function encodeB32(n: number, width: number): string {
  if (!Number.isInteger(n) || n < 0 || n >= 32 ** width) throw new Error(`Value ${n} does not fit ${width} characters`)
  let out = ''
  for (let i = 0; i < width; i++) {
    out = ID_ALPHABET[n % 32]! + out
    n = Math.floor(n / 32)
  }
  return out
}

export function decodeB32(s: string): number {
  let n = 0
  for (const ch of s) {
    const i = INDEX.get(ch)
    if (i === undefined) throw new Error(`Invalid ID character: ${ch}`)
    n = n * 32 + i
  }
  return n
}

/** Build an ID. `network` is the class character plus the network characters, e.g. "B7QM". */
export function formatId(network: string, set: number, obs: number): string {
  const cls = classOf(network[0] ?? '')
  if (!cls || cls.length === null) throw new Error('Unknown ID class')
  if (network.length !== 1 + cls.netLen) throw new Error(`Network must be ${1 + cls.netLen} characters`)
  if (![...network].every((c) => INDEX.has(c))) throw new Error('Network has invalid characters')
  if (!Number.isInteger(set) || set < 0 || set >= 32 ** cls.setLen) throw new Error('Set out of range')
  if (!Number.isInteger(obs) || obs < 0 || obs >= 32 ** cls.obsLen) throw new Error('Observation out of range')
  const payload = network + encodeB32(set, cls.setLen) + encodeB32(obs, cls.obsLen)
  return payload + checkChar(payload)
}

export interface ParsedId {
  kind: IdKind
  /** Class character + network characters, e.g. "B7QM". */
  network: string
  set: number
  obs: number
  check: string
  /** Canonical form without separators. */
  id: string
}

/** Strip separators/spaces and upper-case. Returns null for anything that isn't a plain ID shape. */
export function normalizeId(input: string): string | null {
  const s = String(input ?? '').toUpperCase().replace(/[\s\-_.]/g, '')
  if (!s || ![...s].every((c) => INDEX.has(c))) return null
  return s
}

/** Parse a well-formed ID of a known layout (does not verify the check character). */
export function parseId(input: string): ParsedId | null {
  const id = normalizeId(input)
  if (!id) return null
  const cls = classOf(id[0]!)
  if (!cls || cls.length === null || id.length !== cls.length) return null
  const netEnd = 1 + cls.netLen
  const setEnd = netEnd + cls.setLen
  const obsEnd = setEnd + cls.obsLen
  return {
    kind: cls.kind,
    network: id.slice(0, netEnd),
    set: decodeB32(id.slice(netEnd, setEnd)),
    obs: decodeB32(id.slice(setEnd, obsEnd)),
    check: id.slice(obsEnd),
    id,
  }
}

/** True when the ID has a known layout and a matching check character. */
export function isValidId(input: string): boolean {
  const id = normalizeId(input)
  if (!id) return false
  const p = parseId(id)
  if (!p) return false
  return remainder(id) === 0
}

/** Human display: 4-4-1 for 9 characters, 4-4-4 for 12. Returns the input unchanged if not an ID. */
export function displayId(input: string): string {
  const id = normalizeId(input)
  if (!id) return String(input ?? '')
  if (id.length === 9) return `${id.slice(0, 4)}-${id.slice(4, 8)}-${id.slice(8)}`
  if (id.length === 12) return `${id.slice(0, 4)}-${id.slice(4, 8)}-${id.slice(8)}`
  return id
}

/** '' means "ID pending": the find was logged before this device received any IDs. */
export function isPendingId(id: string | undefined | null): boolean {
  return !id
}
