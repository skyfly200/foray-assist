// A device's stock of reserved IDs: the sets the server issued to it, each counted up locally.
// Pure functions over plain data (no Dexie), so they run under plain Node tests.
import { SET_SIZE, formatId } from './idCode.ts'

export interface IdSet {
  /** Class + network characters, e.g. "B7QM". */
  network: string
  /** Set number 0..1023 within the network. */
  set: number
  /** Next observation number to hand out, 0..1024 (1024 = set exhausted). */
  next: number
}

/** IDs left across all sets. */
export function remaining(sets: IdSet[]): number {
  return sets.reduce((n, s) => n + Math.max(0, SET_SIZE - s.next), 0)
}

/** Take the next ID. Returns null when the stock is empty. Never mutates its input. */
export function takeId(sets: IdSet[]): { id: string | null; sets: IdSet[] } {
  const i = sets.findIndex((s) => s.next < SET_SIZE)
  if (i < 0) return { id: null, sets }
  const s = sets[i]!
  const id = formatId(s.network, s.set, s.next)
  const out = sets.slice()
  out[i] = { ...s, next: s.next + 1 }
  return { id, sets: out }
}

/** Add newly issued sets; a set already known (same network + set) is kept as it is. */
export function mergeSets(existing: IdSet[], incoming: Array<{ network: string; set: number }>): IdSet[] {
  const out = existing.slice()
  for (const n of incoming) {
    if (!out.some((s) => s.network === n.network && s.set === n.set)) out.push({ network: n.network, set: n.set, next: 0 })
  }
  return out
}

/** Whether the stock is low enough to ask the server for more (about one set left). */
export function needsRefill(sets: IdSet[], lowWater = SET_SIZE): boolean {
  return remaining(sets) < lowWater
}
