// The Settings → Voice choice between Whisper and browser speech. A shortcut onto the model
// routing (Settings → Model routing): 'browser' puts browser speech ahead of Whisper in the
// speech route, 'whisper' puts Whisper first. Whisper can still retranscribe the saved audio.
import { computed } from 'vue'
import { preferInRoute, type RouteStep } from '~/utils/modelRouting'

export type SpeechEngine = 'whisper' | 'browser'
/** Settings key the choice used before it moved into the routing; useModelRouting reads it once to migrate. */
export const SPEECH_ENGINE_KEY = 'speechEngine'

export function engineOf(steps: RouteStep[]): SpeechEngine {
  const w = steps.findIndex((s) => s.model === 'whisper')
  const b = steps.findIndex((s) => s.model === 'web-speech')
  return b >= 0 && (w < 0 || b < w) ? 'browser' : 'whisper'
}

export function useSpeechEngine() {
  const { routing, load, save } = useModelRouting()
  const engine = computed(() => engineOf(routing.value.routes.speech))
  async function setEngine(v: SpeechEngine) {
    await load()
    const speech = v === 'browser'
      ? preferInRoute(routing.value.routes.speech, 'web-speech', 'whisper')
      : preferInRoute(routing.value.routes.speech, 'whisper', 'web-speech')
    await save({ ...routing.value, routes: { ...routing.value.routes, speech } })
  }
  return { engine, setEngine, ready: load }
}
