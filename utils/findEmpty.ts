// Empty finds and merging two finds' notes. Pure, so tests can run it in Node.
// A find is "empty" when nothing was ever recorded on it: no photos, voice notes, comments,
// field notes (species, habitat, ...), voucher number or iNaturalist upload. Review Mode hides
// these by default and removes a find automatically when sorting photos leaves it empty.

export interface EmptyCheckFind {
  fieldNotes?: Record<string, string | undefined>
  voucherId?: string | null
  iNatObservationId?: number
}

export interface FindCounts {
  photos: number
  voiceNotes: number
  comments?: number
}

export function hasFieldNotes(notes: Record<string, string | undefined> | undefined): boolean {
  return Object.values(notes ?? {}).some((v) => typeof v === 'string' && v.trim() !== '')
}

export function isEmptyFind(find: EmptyCheckFind, counts: FindCounts): boolean {
  return (
    counts.photos === 0 &&
    counts.voiceNotes === 0 &&
    !(counts.comments ?? 0) &&
    !hasFieldNotes(find.fieldNotes) &&
    !find.voucherId &&
    !find.iNatObservationId
  )
}

/**
 * Notes for a find that absorbs another one. The target's values win; the source fills gaps.
 * When both have different values for a field, the source's value is kept in `notes` so
 * nothing typed is lost.
 */
export function mergeFieldNotes(
  target: Record<string, string | undefined>,
  source: Record<string, string | undefined>,
  label: (key: string) => string = (k) => k,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(target)) if (typeof v === 'string' && v.trim()) out[k] = v
  const extra: string[] = []
  for (const [k, v] of Object.entries(source)) {
    if (typeof v !== 'string' || !v.trim()) continue
    if (!out[k]) out[k] = v
    else if (out[k].trim() !== v.trim()) extra.push(k === 'notes' ? v.trim() : `${label(k)}: ${v.trim()}`)
  }
  if (extra.length) out.notes = [out.notes, ...extra].filter(Boolean).join('\n')
  return out
}
