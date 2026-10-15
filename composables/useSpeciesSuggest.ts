// Names for the species-field autocomplete, read from this device (works offline).
import { ref } from 'vue'
import { parseNameList } from '~/utils/mycoVocab'
import { rankPastNames, suggestSpecies } from '~/utils/speciesSuggest'
import { VOICE_VOCAB_KEY } from '~/composables/useVoiceVocab'

const past = ref<{ name: string; count: number }[]>([])
const custom = ref<string[]>([])

/**
 * Re-read past finds and the voice word list; call when the field gets focus. `exceptRowId` is
 * the find being edited, so its own half-typed name is not offered back.
 */
async function refresh(exceptRowId?: string) {
  const db = useDb()
  try {
    const rows = await db.specimens.toArray()
    past.value = rankPastNames(rows.filter((r) => r.id !== exceptRowId).map((r) => ({ name: r.fieldNotes?.speciesGuess, at: Date.parse(r.timestamp) || 0 })))
  } catch { /* keep what we had */ }
  try { custom.value = parseNameList((await db.settings.get(VOICE_VOCAB_KEY))?.value as string) } catch { /* ignore */ }
}

export function useSpeciesSuggest() {
  return {
    refresh,
    suggest: (query: string, limit = 6) => suggestSpecies(query, { past: past.value, custom: custom.value, limit }),
  }
}
