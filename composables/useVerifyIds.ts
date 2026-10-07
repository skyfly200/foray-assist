// Checks every specimen ID stored on this device. Local checks always run; if online and
// signed in, the server's verify_ids RPC is added on top. Never throws.
export interface IdProblem {
  id: string
  /** Dexie specimen row id (Specimen.id); '' when the server flagged an ID this device cannot match. */
  specimenRowId: string
  /** Code: 'malformed' | 'bad_check' | 'duplicate', or whatever the server returned. */
  problem: string
}

export interface VerifyResult {
  total: number
  problems: IdProblem[]
  checkedOnline: boolean
}

/** Plain-language meaning of each problem code. */
export const ID_PROBLEM_HELP: Record<string, { label: string; help: string }> = {
  malformed: { label: 'Not an ID', help: 'The code has the wrong length or characters, so it is not a Foray Assist ID. It may have been typed or imported by hand.' },
  bad_check: { label: 'Typo in ID', help: 'The last character does not match the rest, so one or more characters were changed after the ID was issued.' },
  duplicate: { label: 'Used twice', help: 'Two or more finds on this device carry the same ID. Each find needs its own.' },
  not_issued: { label: 'Not issued', help: 'The server has no record of issuing this ID to you.' },
  unknown_network: { label: 'Unknown network', help: 'This ID belongs to a network the server does not know.' },
  not_yours: { label: 'Belongs to someone else', help: 'The server issued this ID to a different account.' },
  duplicate_server: { label: 'Used twice (cloud)', help: 'The cloud already holds another find with this ID.' },
}

export async function verifyIds(): Promise<VerifyResult> {
  const db = useDb()
  const specimens = (await db.specimens.toArray()).filter((s) => !!s.specimenId)
  const problems: IdProblem[] = []
  const byId = new Map<string, string[]>() // normalized id -> specimen row ids

  for (const s of specimens) {
    const norm = normalizeId(s.specimenId)
    if (!norm || !parseId(norm)) {
      problems.push({ id: s.specimenId, specimenRowId: s.id, problem: 'malformed' })
      continue
    }
    if (!isValidId(norm)) {
      problems.push({ id: norm, specimenRowId: s.id, problem: 'bad_check' })
      continue
    }
    byId.set(norm, [...(byId.get(norm) ?? []), s.id])
  }
  // Valid IDs from other devices of the same account are fine, so no ownership check on sets.
  for (const [id, rows] of byId) {
    if (rows.length > 1) for (const r of rows) problems.push({ id, specimenRowId: r, problem: 'duplicate' })
  }

  let checkedOnline = false
  try {
    const cfg: any = useRuntimeConfig().public
    const online = typeof navigator === 'undefined' || navigator.onLine
    const { signedIn } = useSync()
    if (online && signedIn.value && cfg?.syncConfigured && cfg?.supabase?.url && cfg?.supabase?.key && byId.size) {
      const sb: any = useSupabaseClient()
      const { data, error } = await sb.rpc('verify_ids', { p_ids: [...byId.keys()] })
      if (!error) {
        checkedOnline = true
        for (const r of (data ?? []) as Array<{ id: string; problem: string }>) {
          if (!r?.problem) continue
          const norm = normalizeId(r.id) ?? r.id
          for (const row of byId.get(norm) ?? ['']) {
            if (!problems.some((p) => p.id === norm && p.specimenRowId === row && p.problem === r.problem)) {
              problems.push({ id: norm, specimenRowId: row, problem: r.problem })
            }
          }
        }
      }
    }
  } catch { checkedOnline = false }

  return { total: specimens.length, problems, checkedOnline }
}

export function useVerifyIds() {
  return { verifyIds }
}
