// Specimen ID codes: COLLECTOR-BNNNC, e.g. SF-M042K
//   COLLECTOR  2-3 letters chosen by the user (default SF), like a collector's number series.
//   B          one block letter from a 32-character alphabet without I, O (and digits 0, 1),
//              so 'O' vs '0' and 'I' vs '1' can never be confused by position.
//   NNN        001-999, a running number within the block (plain decimal, easy to write).
//   C          one check character that catches a mistyped or misread character and swapped
//              neighbours (weighted sum mod 31 over the collector, block and number).
// A block holds 999 IDs; each device draws its own blocks, and a preprinted sheet (roadmap
// Phase 7) is just a range of numbers inside a reserved block. Pure module: no imports,
// erasable TypeScript, unit-tested under plain Node.

export const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const BLOCK_SIZE = 999
export const DEFAULT_COLLECTOR = 'SF'
const CHECK_MODULUS = 31 // prime, <= alphabet size

const ID_RE = /^([A-Z]{2,3})-([A-HJ-NP-Z2-9])(\d{3})([A-HJ-NP-Z2-9])$/

export interface ParsedId {
  collector: string
  block: string
  number: number
  check: string
}

function charValue(c: string): number {
  const code = c.charCodeAt(0)
  if (code >= 48 && code <= 57) return code - 48 // 0-9
  if (code >= 65 && code <= 90) return code - 55 // A=10 .. Z=35
  throw new Error(`Invalid ID character: ${c}`)
}

/** Check character for the payload `collector + block + 3-digit number`. */
export function checkChar(payload: string): string {
  let sum = 0
  for (let i = 0; i < payload.length; i++) sum += charValue(payload[i]!) * (i + 1)
  return ID_ALPHABET[sum % CHECK_MODULUS]!
}

export function normalizeCollector(input: string | undefined | null): string {
  const c = String(input ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3)
  return c.length >= 2 ? c : DEFAULT_COLLECTOR
}

export function isBlock(b: string): boolean {
  return b.length === 1 && ID_ALPHABET.includes(b)
}

export function formatId(collector: string, block: string, n: number): string {
  if (!/^[A-Z]{2,3}$/.test(collector)) throw new Error('Collector code must be 2-3 letters')
  if (!isBlock(block)) throw new Error('Invalid block letter')
  if (!Number.isInteger(n) || n < 1 || n > BLOCK_SIZE) throw new Error('Number must be 1-999')
  const body = block + String(n).padStart(3, '0')
  return `${collector}-${body}${checkChar(collector + body)}`
}

/** Parse an ID shape (does not verify the check character). */
export function parseId(id: string): ParsedId | null {
  const m = ID_RE.exec(String(id).trim().toUpperCase())
  if (!m) return null
  return { collector: m[1]!, block: m[2]!, number: Number(m[3]), check: m[4]! }
}

/** True when the ID is well-formed and its check character matches. */
export function isValidId(id: string): boolean {
  const p = parseId(id)
  if (!p || p.number < 1) return false
  return checkChar(p.collector + p.block + String(p.number).padStart(3, '0')) === p.check
}

/** Pick a block not in `used`. `rand` returns [0,1); inject for tests. Null when all 32 are used. */
export function pickBlock(used: string[], rand: () => number = Math.random): string | null {
  const free = ID_ALPHABET.split('').filter((b) => !used.includes(b))
  if (!free.length) return null
  return free[Math.floor(rand() * free.length)]!
}
