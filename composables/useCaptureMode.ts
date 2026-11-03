// What the bottom bar's New find button opens (Settings → Capture, settings key 'captureMode').
// 'guided': a new find opens straight in guided capture, in AR when the phone supports it,
// else the guided camera. 'photo': the phone's own camera app; the photo becomes a new find.
import { ref } from 'vue'

export type CaptureMode = 'guided' | 'photo'
export const CAPTURE_MODE_KEY = 'captureMode'

const mode = ref<CaptureMode>('guided')
let loaded: Promise<void> | null = null

function load() {
  loaded ??= (async () => {
    try {
      const v = (await useDb().settings.get(CAPTURE_MODE_KEY))?.value
      if (v === 'guided' || v === 'photo') mode.value = v
    } catch { /* ignore */ }
  })()
  return loaded
}

async function setMode(v: CaptureMode) {
  mode.value = v
  try { await useDb().settings.put({ key: CAPTURE_MODE_KEY, value: v }) } catch { /* ignore */ }
}

export function useCaptureMode() {
  if (typeof window !== 'undefined') load()
  return { mode, setMode, ready: load }
}
