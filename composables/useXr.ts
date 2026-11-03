// WebXR AR session for the guided capture screen (ROADMAP Phase 14).
// Chrome on Android (ARCore) only: immersive-ar with hit-test and a DOM overlay. Nothing is
// drawn in WebGL; markers and notes are HTML in the overlay, positioned each frame by projecting
// their world position onto the screen. Anchors keep them in place when the module is offered;
// otherwise a fixed pose in the session's space is used, which drifts a little more.
// Raw camera access (Chrome flag/origin trial on some versions) lets the guide save a photo
// without leaving AR; without it the page ends the session and takes the photo with the camera.

import { ref, type Ref } from 'vue'
import { project, type ScreenPos, type XrPoint } from '~/utils/xrMath'

export type { ScreenPos, XrPoint }

export interface XrMark {
  id: string
  /** Where it is right now, in the session's 'local' space. */
  at: XrPoint | null
  anchor?: any
}

export async function arSupported(): Promise<boolean> {
  try {
    const xr = (navigator as any).xr
    return !!xr && window.isSecureContext && (await xr.isSessionSupported('immersive-ar'))
  } catch {
    return false
  }
}

export interface XrHandle {
  /** A surface is under the centre of the screen. */
  surface: Ref<boolean>
  /** The session can save photos itself. */
  canPhoto: Ref<boolean>
  marks: Ref<Record<string, XrMark>>
  /** Screen position of each mark's point, plus any offsets asked for in `offsets`. Updated every frame. */
  screen: Ref<Record<string, ScreenPos>>
  /** Extra points to track, relative to a mark: key -> { mark, offset in metres }. */
  offsets: Ref<Record<string, { mark: string; offset: XrPoint }>>
  /** Put a mark where the centre of the screen meets a surface. false if no surface yet. */
  place: (id: string) => Promise<boolean>
  photo: () => Promise<Blob | null>
  end: () => Promise<void>
}

// Session requests tried in order. The first is the full set. If the browser rejects it with
// NotSupportedError, the second asks for only the required pair, after a short wait, so a
// camera that is still letting go or an optional feature this build dislikes cannot block AR.
const SESSION_TRIES = [
  { requiredFeatures: ['hit-test', 'dom-overlay'], optionalFeatures: ['anchors', 'camera-access', 'local-floor'] },
  { requiredFeatures: ['hit-test', 'dom-overlay'], optionalFeatures: [] },
]

async function requestArSession(overlay: HTMLElement, tries: typeof SESSION_TRIES): Promise<any> {
  const xr = (navigator as any).xr
  let lastError: any
  for (const [i, config] of tries.entries()) {
    if (i) await new Promise((r) => setTimeout(r, 500))
    try {
      return await xr.requestSession('immersive-ar', { ...config, domOverlay: { root: overlay } })
    } catch (e: any) {
      lastError = e
      if (e?.name !== 'NotSupportedError') throw e
    }
  }
  throw lastError
}

/** A failure where the browser or phone ended the session before it drew anything. Worth one retry. */
export function endedEarly(e: unknown): boolean {
  return !!(e as any)?.endedEarly
}
function earlyEnd(message: string) {
  const e = new DOMException(message, 'NotSupportedError') as DOMException & { endedEarly?: boolean }
  e.endedEarly = true
  return e
}

/** `minimal` asks only for the required features, for the retry after an early end. */
export async function startAr(overlay: HTMLElement, onEnd: () => void, minimal = false): Promise<XrHandle> {
  const session = await requestArSession(overlay, minimal ? SESSION_TRIES.slice(1) : SESSION_TRIES)

  // Some browsers accept the session but do not draw the overlay. Without it the screen would
  // show only the camera feed and no controls, so end it and say why.
  if ('domOverlayState' in session && !session.domOverlayState) {
    await session.end().catch(() => {})
    throw new DOMException('This browser started AR without drawing the controls over the camera', 'NotSupportedError')
  }

  const surface = ref(false)
  const canPhoto = ref(false)
  const marks = ref<Record<string, XrMark>>({})
  const screen = ref<Record<string, ScreenPos>>({})
  const offsets = ref<Record<string, { mark: string; offset: XrPoint }>>({})

  let gl: WebGL2RenderingContext | WebGLRenderingContext
  let space: any, viewer: any, hitSource: any, binding: any
  try {
    const canvas = document.createElement('canvas')
    gl = (canvas.getContext('webgl2', { xrCompatible: true, alpha: true }) as any) ?? (canvas.getContext('webgl', { xrCompatible: true, alpha: true }) as any)
    if (!gl) throw new Error('WebGL is not available')
    const XRLayer = (window as any).XRWebGLLayer
    session.updateRenderState({ baseLayer: new XRLayer(session, gl, { alpha: true }) })
    space = await session.requestReferenceSpace('local')
    viewer = await session.requestReferenceSpace('viewer')
    hitSource = await session.requestHitTestSource({ space: viewer })
    const Binding = (window as any).XRWebGLBinding
    binding = Binding ? new Binding(session, gl) : null
  } catch (e) {
    // Don't leave a half-started session holding the camera.
    await session.end().catch(() => {})
    throw e
  }

  let lastHit: any = null
  let ended = false
  let wantPhoto: ((b: Blob | null) => void) | null = null

  // The session only counts as started once it draws a frame. If the browser ends it first, or
  // never draws, that is an error for the screen to show, not a silent return to the camera.
  let markStarted = () => {}
  let failStart = (_e: Error) => {}
  const started = new Promise<void>((resolve, reject) => {
    markStarted = resolve
    failStart = reject
  })

  session.addEventListener('end', () => {
    failStart(earlyEnd('The browser ended AR before it drew a frame'))
    ended = true
    hitSource?.cancel?.()
    wantPhoto?.(null)
    wantPhoto = null
    onEnd()
  })

  function readCamera(view: any): Promise<Blob | null> | null {
    if (!binding || !view.camera) return null
    const tex = binding.getCameraImage(view.camera)
    if (!tex) return null
    const w = view.camera.width, h = view.camera.height
    const fb = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
    let out: Promise<Blob | null> | null = null
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
      const px = new Uint8ClampedArray(w * h * 4)
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px)
      // GL rows run bottom-up.
      const img = new ImageData(w, h)
      const row = w * 4
      for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * row, (h - y) * row), y * row)
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      c.getContext('2d')!.putImageData(img, 0, 0)
      out = new Promise((r) => c.toBlob((b) => r(b), 'image/jpeg', 0.92))
    }
    gl.deleteFramebuffer(fb)
    return out
  }

  function onFrame(_t: number, frame: any) {
    if (ended) return
    session.requestAnimationFrame(onFrame)
    const layer = session.renderState.baseLayer
    gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    const hits = frame.getHitTestResults(hitSource)
    lastHit = hits.length ? hits[0] : null
    surface.value = !!lastHit

    // Anchors move as tracking improves; read their current pose.
    const tracked = frame.trackedAnchors
    for (const m of Object.values(marks.value)) {
      if (m.anchor && tracked?.has(m.anchor)) {
        const p = frame.getPose(m.anchor.anchorSpace, space)
        if (p) m.at = { x: p.transform.position.x, y: p.transform.position.y, z: p.transform.position.z }
      }
    }

    const pose = frame.getViewerPose(space)
    if (!pose) return
    markStarted()
    const view = pose.views[0]
    canPhoto.value = !!(binding && view.camera)
    if (wantPhoto) {
      const done = wantPhoto
      wantPhoto = null
      const p = readCamera(view)
      if (p) p.then(done, () => done(null))
      else done(null)
    }
    const w = overlay.clientWidth, h = overlay.clientHeight
    const vm = view.transform.inverse.matrix
    const next: Record<string, ScreenPos> = {}
    for (const [id, m] of Object.entries(marks.value)) if (m.at) next[id] = project(view.projectionMatrix, vm, m.at, w, h)
    for (const [key, o] of Object.entries(offsets.value)) {
      const base = marks.value[o.mark]?.at
      if (base) next[key] = project(view.projectionMatrix, vm, { x: base.x + o.offset.x, y: base.y + o.offset.y, z: base.z + o.offset.z }, w, h)
    }
    screen.value = next
  }
  session.requestAnimationFrame(onFrame)

  const timer = setTimeout(() => failStart(earlyEnd('AR opened but drew no frames')), 5000)
  try {
    await started
  } catch (e) {
    await session.end().catch(() => {})
    throw e
  } finally {
    clearTimeout(timer)
  }

  return {
    surface,
    canPhoto,
    marks,
    screen,
    offsets,
    async place(id) {
      const hit = lastHit
      if (!hit) return false
      const p = hit.getPose(space)
      if (!p) return false
      const mark: XrMark = { id, at: { x: p.transform.position.x, y: p.transform.position.y, z: p.transform.position.z } }
      try {
        if (hit.createAnchor) mark.anchor = await hit.createAnchor()
      } catch {
        // No anchors: keep the fixed pose.
      }
      marks.value = { ...marks.value, [id]: mark }
      return true
    },
    photo() {
      if (ended) return Promise.resolve(null)
      return new Promise((r) => { wantPhoto = r })
    },
    async end() {
      if (!ended) await session.end().catch(() => {})
    },
  }
}
