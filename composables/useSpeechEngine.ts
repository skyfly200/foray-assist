// Which speech-to-text the recorder uses (Settings → Voice, settings key 'speechEngine').
// 'whisper': on-device Whisper when its model is downloaded, browser speech otherwise.
// 'browser': the browser's own speech recognition whenever it is online; Whisper can still
// retranscribe the saved audio later.
import { ref } from 'vue'

export type SpeechEngine = 'whisper' | 'browser'
export const SPEECH_ENGINE_KEY = 'speechEngine'

const engine = ref<SpeechEngine>('whisper')
let loaded: Promise<void> | null = null

function load() {
  loaded ??= (async () => {
    try {
      const v = (await useDb().settings.get(SPEECH_ENGINE_KEY))?.value
      if (v === 'whisper' || v === 'browser') engine.value = v
    } catch { /* ignore */ }
  })()
  return loaded
}

async function setEngine(v: SpeechEngine) {
  engine.value = v
  try { await useDb().settings.put({ key: SPEECH_ENGINE_KEY, value: v }) } catch { /* ignore */ }
}

export function useSpeechEngine() {
  if (typeof window !== 'undefined') load()
  return { engine, setEngine, ready: load }
}
