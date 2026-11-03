<template>
  <div class="ar-test">
    <h1>AR test</h1>
    <p>Starts AR two ways, so we can see which one the phone keeps open. Tap one, stay in AR for a few seconds, then come back here.</p>
    <button :disabled="busy" @click="run(false)">Plain AR (no overlay)</button>
    <button :disabled="busy" @click="run(true)">AR with DOM overlay</button>
    <div v-if="overlay" ref="overlayRoot" class="overlay" aria-hidden="true">
      <div class="overlay-text">Overlay test. Tap Exit.</div>
      <button @click="exit">Exit</button>
    </div>
    <pre>{{ log }}</pre>
  </div>
</template>

<script setup lang="ts">
// Diagnostic only: starts an immersive-ar session with or without a DOM overlay and records how
// long the phone keeps it open. Not linked from the app; used to see which setting ends AR early.
import { ref, nextTick } from 'vue'

const busy = ref(false)
const overlay = ref(false)
const overlayRoot = ref<HTMLElement | null>(null)
const log = ref('Not run yet.')
let session: any = null

function say(line: string) {
  log.value += '\n' + line
}

async function run(withOverlay: boolean) {
  busy.value = true
  log.value = `${withOverlay ? 'With DOM overlay' : 'Plain'}: requesting session`
  overlay.value = withOverlay
  await nextTick()
  const init: any = { requiredFeatures: ['hit-test'] }
  if (withOverlay) {
    init.requiredFeatures.push('dom-overlay')
    init.domOverlay = { root: overlayRoot.value }
  }
  try {
    session = await (navigator as any).xr.requestSession('immersive-ar', init)
    const started = Date.now()
    let frames = 0
    session.addEventListener('end', () => {
      say(`Session ended after ${((Date.now() - started) / 1000).toFixed(1)} s, ${frames} frames drawn.`)
      session = null
      busy.value = false
      overlay.value = false
    })
    const canvas = document.createElement('canvas')
    const gl: any = canvas.getContext('webgl', { xrCompatible: true, alpha: true })
    session.updateRenderState({ baseLayer: new (window as any).XRWebGLLayer(session, gl, { alpha: true }) })
    const space = await session.requestReferenceSpace('local')
    say(`Session started. domOverlayState: ${session.domOverlayState ? session.domOverlayState.type : 'none'}.`)
    const onFrame = (_t: number, frame: any) => {
      if (!session) return
      session.requestAnimationFrame(onFrame)
      frames++
      frame.getViewerPose(space)
    }
    session.requestAnimationFrame(onFrame)
  } catch (e: any) {
    say(`Could not start: ${e?.name}: ${e?.message}`)
    busy.value = false
    overlay.value = false
  }
}

function exit() {
  session?.end().catch(() => {})
}
</script>

<style scoped>
.ar-test { padding: 16px; font-family: sans-serif; }
button { display: block; margin: 8px 0; padding: 12px; font-size: 1rem; width: 100%; }
pre { white-space: pre-wrap; background: #f3f3f3; padding: 8px; border-radius: 8px; }
.overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.4); color: #fff; display: grid; place-content: center; text-align: center; gap: 16px; z-index: 3000; }
.overlay-text { font-size: 1.4rem; }
</style>
