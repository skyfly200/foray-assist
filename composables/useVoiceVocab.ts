// Vocabulary that helps speech-to-text with mycology: the user's own word list (settings
// 'voiceVocab', one name per line) plus the species guesses already entered for this foray.
import { buildWhisperPrompt, correctTranscript, parseNameList } from '~/utils/mycoVocab'

export const VOICE_VOCAB_KEY = 'voiceVocab'

export async function loadVoiceVocab(forayId?: string): Promise<string[]> {
  const db = useDb()
  let custom: string[] = []
  let guesses: string[] = []
  try { custom = parseNameList((await db.settings.get(VOICE_VOCAB_KEY))?.value as string) } catch { /* ignore */ }
  if (forayId) {
    try {
      const rows = await db.specimens.where('forayId').equals(forayId).toArray()
      guesses = rows.map((r) => r.fieldNotes?.speciesGuess?.trim() ?? '').filter((g) => g && g.length <= 80)
    } catch { /* ignore */ }
  }
  return [...guesses, ...custom]
}

/** Prompt and correction pass for one recording, built once when it starts. */
export async function voiceVocabFor(forayId?: string) {
  const extra = await loadVoiceVocab(forayId)
  return {
    prompt: buildWhisperPrompt(extra),
    correct: (text: string) => correctTranscript(text, extra),
  }
}
