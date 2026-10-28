<template>
  <div ref="root" class="guide" :class="{ 'guide--ar': ar }">
    <video v-show="!ar" ref="video" class="feed" autoplay playsinline muted @click="onFeedTap" />
    <div v-if="!ar && camError" class="feed-msg">
      <v-icon icon="mdi-camera-off" size="40" />
      <div class="mt-2">{{ camError }}</div>
    </div>

    <!-- AR: a ring of shot markers around the find, and the reticle in the middle. -->
    <template v-if="ar && xr">
      <div class="reticle" :class="{ on: xr.surface.value }" aria-hidden="true" />
      <template v-if="findPos?.visible">
        <div class="anchor-dot" :style="at(findPos)" aria-hidden="true">🍄</div>
        <div class="field-tags" :style="at(findPos, 28, -12)">
          <span v-for="f in liveFilled" :key="f.key" class="tag">{{ f.label }}: {{ f.value }}</span>
        </div>
      </template>
      <template v-for="a in SHOT_ANGLES" :key="a">
        <button
          v-if="xr.screen.value['ring:' + a]?.visible"
          class="ring-mark"
          :class="{ done: shots[a], current: target === a }"
          :style="at(xr.screen.value['ring:' + a])"
          :aria-label="`${SHOT_LABELS[a].label} shot`"
          @click="target = a"
        >
          <v-icon :icon="shots[a] ? 'mdi-check' : SHOT_LABELS[a].icon" size="18" />
          <span>{{ SHOT_LABELS[a].label }}</span>
        </button>
      </template>
    </template>

    <!-- Pinned notes: on the screen in camera mode, in the world in AR. -->
    <template v-for="p in pins" :key="p.id">
      <div v-if="pinPos(p)?.visible" class="pin" :class="{ 'pin--left': pinPos(p)!.x > (root?.clientWidth ?? 0) * 0.55 }" :style="at(pinPos(p)!)">
        <v-icon icon="mdi-map-marker" size="22" color="#ffd54f" />
        <div class="pin-note">{{ p.text || (recording && p.id === pinWaiting ? caption || 'Listening…' : 'Tap the mic to add a note') }}</div>
      </div>
    </template>

    <!-- Top: back, completeness, AR switch. -->
    <div class="top">
      <v-btn icon="mdi-arrow-left" variant="flat" class="glass" aria-label="Back to the find" @click="leave" />
      <div class="score glass">
        <v-progress-circular :model-value="Math.round(percent * 100)" :size="40" :width="5" :color="percent >= MIN_THOROUGHNESS ? 'success' : 'warning'">
          <span class="score-num">{{ Math.round(percent * 100) }}</span>
        </v-progress-circular>
        <div class="score-text">
          <div class="score-label">Thoroughness</div>
          <div class="score-sub">{{ percent >= MIN_THOROUGHNESS ? 'Counts toward Finds' : `${Math.round(MIN_THOROUGHNESS * 100)}% to count as a find` }}</div>
        </div>
      </div>
      <v-btn v-if="arOk && !ar" variant="flat" class="glass" prepend-icon="mdi-cube-scan" @click="enterAr">AR</v-btn>
      <v-btn v-else-if="ar" variant="flat" class="glass" prepend-icon="mdi-camera" @click="exitAr">Camera</v-btn>
    </div>

    <!-- Shot checklist. -->
    <div class="shots">
      <button
        v-for="a in SHOT_ANGLES"
        :key="a"
        class="shot glass"
        :class="{ done: shots[a], current: target === a }"
        :aria-pressed="target === a"
        @click="target = a"
      >
        <v-icon :icon="shots[a] ? 'mdi-check-circle' : SHOT_LABELS[a].icon" size="18" />
        {{ SHOT_LABELS[a].label }}
      </button>
    </div>
    <div class="hint glass">{{ hint }}</div>

    <!-- Fields voice filled, in camera mode (AR shows them on the find). -->
    <div v-if="!ar && liveFilled.length" class="field-tags field-tags--side">
      <span v-for="f in liveFilled" :key="f.key" class="tag">{{ f.label }}: {{ f.value }}</span>
    </div>

    <!-- Opened from New find: AR needs one more tap when the first one has run out, and says why it failed. -->
    <div v-if="arPrompt || arError" class="ar-start glass">
      <template v-if="arError">
        <div class="font-weight-bold">AR couldn't start</div>
        <div class="text-caption mt-1">{{ arError }}</div>
      </template>
      <div v-else class="font-weight-bold">Start AR?</div>
      <div class="d-flex justify-center ga-2 mt-3">
        <v-btn color="primary" prepend-icon="mdi-cube-scan" @click="enterAr">{{ arError ? 'Try again' : 'Start AR' }}</v-btn>
        <v-btn variant="text" color="white" @click="useCameraInstead">Use camera</v-btn>
      </div>
    </div>

    <div v-if="flash" class="flash" aria-hidden="true" />
    <transition name="pop">
      <div v-if="toast" :key="toast.key" class="toast">{{ toast.text }}</div>
    </transition>

    <!-- Bottom: captions and controls. -->
    <div class="bottom">
      <div v-if="caption" class="caption" aria-live="polite">{{ caption }}</div>
      <div class="controls">
        <div class="mic">
          <VoiceRecorder
            v-if="find"
            compact
            :foray-id="find.forayId"
            :specimen-row-id="find.id"
            @interim="caption = $event"
            @recording="onRecording"
            @filled="liveFilled = $event"
            @saved="onSaved"
          />
        </div>
        <button class="shutter" :disabled="busy || (!ar && !!camError)" aria-label="Take photo" @click="shoot">
          <v-progress-circular v-if="busy" indeterminate color="white" />
        </button>
        <div class="side-btns">
          <v-btn
            :icon="pinMode ? 'mdi-map-marker-check' : 'mdi-map-marker-plus'"
            variant="flat"
            class="glass"
            :color="pinMode ? 'amber' : undefined"
            :aria-label="ar ? 'Pin a note where the circle is' : 'Pin a note: tap the picture'"
            @click="onPinButton"
          />
          <v-btn icon="mdi-format-list-checks" variant="flat" class="glass" aria-label="What's left" @click="listOpen = true" />
        </div>
      </div>
      <div v-if="ar && !findPlaced" class="ar-help glass">
        {{ xr?.surface.value ? 'Aim the circle at the mushroom, then tap Place.' : 'Move the phone slowly to find the ground.' }}
        <v-btn class="ml-2" size="small" color="primary" :disabled="!xr?.surface.value" @click="placeFind">Place</v-btn>
      </div>
      <div v-else-if="pinMode && !ar" class="ar-help glass">Tap the picture where the note goes.</div>
    </div>

    <v-bottom-sheet v-model="listOpen" :z-index="2100">
      <v-card title="Still to record" :subtitle="`${done} of ${items.length} done`">
        <v-list density="compact">
          <v-list-item v-for="i in items" :key="i.key" :title="i.label">
            <template #prepend>
              <v-icon :icon="i.done ? 'mdi-check-circle' : 'mdi-circle-outline'" :color="i.done ? 'success' : undefined" />
            </template>
          </v-list-item>
        </v-list>
        <v-card-text class="text-caption text-medium-emphasis pt-0">Say details out loud ("white gills, smells like anise") and they fill in.</v-card-text>
      </v-card>
    </v-bottom-sheet>
  </div>
</template>

<script setup lang="ts">
// Guided capture (ROADMAP Phase 14): a full-screen camera that asks for each diagnostic shot,
// shows live captions while you talk, lets you pin notes on the picture, and scores the record.
// On Chrome for Android it can switch to WebXR AR, where the shots become a ring of markers
// around the find and pinned notes stay where you put them in the world.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { addPhoto, removeIfEmpty, useLiveQuery } from '~/composables/useFinds'
import { arSupported, startAr, type XrHandle, type ScreenPos } from '~/composables/useXr'
import { checklist, MIN_THOROUGHNESS, SHOT_ANGLES, SHOT_LABELS, shotsDone, thoroughness, type ShotAngle } from '~/utils/score'
import type { Photo, Specimen } from '~/utils/db'

const route = useRoute()
const router = useRouter()
const findId = computed(() => String(route.params.id))
// Opened from the bottom bar's New find: the find was made for this screen, so try AR straight
// away and drop the find again if nothing gets recorded.
const isNew = route.query.new === '1'

const data = useLiveQuery(async () => {
  const db = useDb()
  const [find, photos, voice] = await Promise.all([
    db.specimens.get(findId.value),
    db.photos.where('specimenRowId').equals(findId.value).toArray(),
    db.voiceNotes.where('specimenRowId').equals(findId.value).count(),
  ])
  return { find: find ?? null, photos, voice }
}, { find: null as Specimen | null, photos: [] as Photo[], voice: 0 })

const find = computed(() => data.value.find)
const shots = computed(() => shotsDone(data.value.photos))
const items = computed(() => (find.value ? checklist(find.value, data.value.photos, data.value.voice) : []))
const percent = computed(() => thoroughness(items.value))
const done = computed(() => items.value.filter((i) => i.done).length)

const target = ref<ShotAngle>('cap')
const hint = computed(() => (shots.value[target.value] ? `${SHOT_LABELS[target.value].label} done. Take another or pick the next shot.` : SHOT_LABELS[target.value].hint))
// Start on the first missing shot once the find loads.
let picked = false
watch(shots, (s) => {
  if (picked || !find.value) return
  picked = true
  target.value = SHOT_ANGLES.find((a) => !s[a]) ?? 'cap'
})

// ---------- scoring feedback ----------
const toast = ref<{ key: number; text: string } | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | null = null
function say(text: string) {
  toast.value = { key: Date.now(), text }
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = null), 2200)
}
let lastPct: number | null = null
watch(percent, (p) => {
  if (!find.value) return
  if (lastPct !== null && p > lastPct) {
    const gain = Math.round((p - lastPct) * 100)
    if (lastPct < MIN_THOROUGHNESS && p >= MIN_THOROUGHNESS) say(`+${gain}% · Counts toward your Finds!`)
    else if (p === 1) say('100% · Complete record!')
    else say(`+${gain}% Thoroughness`)
  }
  lastPct = p
})

// ---------- camera ----------
const root = ref<HTMLElement | null>(null)
const video = ref<HTMLVideoElement | null>(null)
const camError = ref('')
let stream: MediaStream | null = null
let camStarting: Promise<void> = Promise.resolve()
// False once AR takes over, so a camera that opens late is closed again instead of
// holding the camera ARCore needs.
let camWanted = false

/** Resolves once the camera shows frames (or after 3 s). */
async function cameraReady() {
  await camStarting
  for (let i = 0; i < 30 && !(video.value?.videoWidth); i++) await new Promise((r) => setTimeout(r, 100))
}

function startCamera() {
  if (camWanted) return camStarting
  camWanted = true
  camStarting = openCamera()
  return camStarting
}
async function openCamera() {
  camError.value = ''
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
    if (!camWanted) { s.getTracks().forEach((t) => t.stop()); return }
    stream = s
    if (video.value) video.value.srcObject = stream
  } catch (e: any) {
    camError.value = e?.name === 'NotAllowedError' ? 'Allow camera access to use guided capture.' : 'The camera is not available.'
  }
}
/**
 * Stops the camera and waits for it to be let go, so AR can take it. A camera that is still
 * opening is waited for first (up to 1.5 s, in case a permission prompt is open), because it
 * would otherwise come up after AR has asked for it.
 */
async function releaseCamera() {
  await Promise.race([camStarting, new Promise((r) => setTimeout(r, 1500))])
  if (stopCamera()) await new Promise((r) => setTimeout(r, 300))
}
/** Stops the camera. True when it was running. */
function stopCamera() {
  camWanted = false
  const was = !!stream
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
  if (video.value) video.value.srcObject = null
  return was
}

async function grabFrame(): Promise<Blob | null> {
  const track = stream?.getVideoTracks()[0]
  const IC = (window as any).ImageCapture
  if (track && IC) {
    try { return await new IC(track).takePhoto() } catch { /* fall back to a video frame */ }
  }
  const v = video.value
  if (!v || !v.videoWidth) return null
  const c = document.createElement('canvas')
  c.width = v.videoWidth
  c.height = v.videoHeight
  c.getContext('2d')!.drawImage(v, 0, 0)
  return new Promise((r) => c.toBlob((b) => r(b), 'image/jpeg', 0.92))
}

const busy = ref(false)
const flash = ref(false)
const listOpen = ref(false)
async function shoot() {
  if (!find.value || busy.value) return
  busy.value = true
  try {
    let blob: Blob | null = null
    if (ar.value && xr.value) {
      blob = xr.value.canPhoto.value ? await xr.value.photo() : null
      if (!blob) {
        // This phone can't save photos from AR: take it with the camera instead.
        say('Taking the photo with the camera')
        await exitAr()
        await cameraReady()
        blob = await grabFrame()
      }
    } else {
      blob = await grabFrame()
    }
    if (!blob) { say('Could not take the photo'); return }
    const angle = target.value
    await addPhoto(find.value.id, find.value.forayId, blob, 'capture', undefined, angle)
    flash.value = true
    setTimeout(() => (flash.value = false), 150)
    // Move on to the next shot still missing.
    const next = SHOT_ANGLES.find((a) => a !== angle && !shotsDone([...data.value.photos, { specimenRowId: '', angle }])[a])
    if (next) target.value = next
    else say('Every angle covered!')
  } finally {
    busy.value = false
  }
}

// ---------- voice ----------
const caption = ref('')
const recording = ref(false)
const liveFilled = ref<{ key: string; label: string; value: string }[]>([])
let captionTimer: ReturnType<typeof setTimeout> | null = null
function onRecording(on: boolean) {
  recording.value = on
  if (on && captionTimer) clearTimeout(captionTimer)
}
function onSaved(n: { id: string; transcript: string }) {
  // Keep the last words up briefly, then clear.
  caption.value = n.transcript
  captionTimer = setTimeout(() => (caption.value = ''), 4000)
  if (pinWaiting.value) {
    const p = pins.value.find((x) => x.id === pinWaiting.value)
    if (p) p.text = n.transcript || '(no words heard)'
    pinWaiting.value = null
  }
}

// ---------- pinned notes ----------
// A pin is placed first; the next voice note you record becomes its text. Pins live for this
// screen only; the note itself is saved on the find like any other voice note.
interface Pin { id: string; text: string; sx?: number; sy?: number; ar?: boolean }
const pins = ref<Pin[]>([])
const pinMode = ref(false)
const pinWaiting = ref<string | null>(null)

function addPin(p: Pin) {
  pins.value = [...pins.value, p]
  pinWaiting.value = p.id
  pinMode.value = false
  say('Pinned. Tap the mic and say your note.')
}
async function onPinButton() {
  if (!ar.value) { pinMode.value = !pinMode.value; return }
  const id = 'pin:' + Date.now()
  if (await xr.value?.place(id)) addPin({ id, text: '', ar: true })
  else say('Point the circle at a surface first')
}
function onFeedTap(e: MouseEvent) {
  if (!pinMode.value || !root.value) return
  const r = root.value.getBoundingClientRect()
  addPin({ id: 'pin:' + Date.now(), text: '', sx: (e.clientX - r.left) / r.width, sy: (e.clientY - r.top) / r.height })
}
function pinPos(p: Pin): ScreenPos | null {
  if (p.ar) return ar.value ? xr.value?.screen.value[p.id] ?? null : null
  if (ar.value || !root.value) return null
  return { x: (p.sx ?? 0) * root.value.clientWidth, y: (p.sy ?? 0) * root.value.clientHeight, visible: true }
}
const at = (s: ScreenPos, dx = 0, dy = 0) => ({ transform: `translate(${Math.round(s.x + dx)}px, ${Math.round(s.y + dy)}px)` })

// ---------- AR ----------
const arOk = ref(false)
const ar = ref(false)
const arPrompt = ref(false)
const arError = ref('')
const xr = ref<XrHandle | null>(null)
const findPlaced = computed(() => !!xr.value?.marks.value.find)
const findPos = computed(() => xr.value?.screen.value.find ?? null)
const RING_M = 0.3

async function enterAr() {
  if (!root.value) return
  arPrompt.value = false
  arError.value = ''
  // Let go of the camera before ARCore asks for it; the tap that started this stays valid for
  // a few seconds, which is what requestSession needs.
  await releaseCamera()
  try {
    const h = await startAr(root.value, () => {
      // Ended by us or by the system (back button, app switch).
      xr.value = null
      ar.value = false
      pins.value = pins.value.filter((p) => !p.ar || p.text)
      void startCamera()
    })
    // Shot markers sit on a ring around the find: cap above, the others around it.
    h.offsets.value = {
      'ring:cap': { mark: 'find', offset: { x: 0, y: RING_M, z: 0 } },
      'ring:underside': { mark: 'find', offset: { x: RING_M, y: 0.05, z: 0 } },
      'ring:stem': { mark: 'find', offset: { x: -RING_M, y: 0.05, z: 0 } },
      'ring:habitat': { mark: 'find', offset: { x: 0, y: 0.05, z: -RING_M * 2 } },
    }
    xr.value = h
    ar.value = true
  } catch (e: any) {
    // Say exactly what the browser said, so it can be reported.
    arError.value = [e?.name, e?.message].filter(Boolean).join(': ') || String(e)
    void startCamera()
  }
}
function useCameraInstead() {
  arPrompt.value = false
  arError.value = ''
  void startCamera()
}
async function exitAr() {
  await xr.value?.end()
}
async function placeFind() {
  if (await xr.value?.place('find')) say('Find marked. Walk around it for each shot.')
}

function leave() {
  if (find.value) router.push(`/forays/${find.value.forayId}`)
  else router.back()
}

onMounted(async () => {
  if (!isNew) void startCamera()
  arOk.value = await arSupported()
  if (!isNew) return
  if (!arOk.value) {
    void startCamera()
    say('AR isn\'t available here, using the camera')
    return
  }
  // The New find tap usually still counts as the gesture AR needs; if it has run out, ask for a tap.
  const act = (navigator as any).userActivation
  if (act && !act.isActive) arPrompt.value = true
  else await enterAr()
})
onBeforeUnmount(() => {
  if (isNew) void removeIfEmpty(findId.value)
  stopCamera()
  void xr.value?.end()
  if (toastTimer) clearTimeout(toastTimer)
  if (captionTimer) clearTimeout(captionTimer)
})
</script>

<style scoped>
.guide {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: #000;
  color: #fff;
  overflow: hidden;
  user-select: none;
}
.guide--ar { background: transparent; }
.feed { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.feed-msg { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; padding: 24px; opacity: 0.8; }
.glass {
  background: rgba(0, 0, 0, 0.45) !important;
  color: #fff !important;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.15);
}
.top {
  position: absolute; top: 0; left: 0; right: 0;
  display: flex; align-items: center; gap: 10px;
  padding: calc(env(safe-area-inset-top) + 12px) 12px 0;
}
.score { display: flex; align-items: center; gap: 10px; padding: 6px 12px 6px 6px; border-radius: 28px; flex: 1; min-width: 0; }
.score-num { font-weight: 800; font-size: 0.85rem; color: #fff; }
.score-label { font-weight: 700; font-size: 0.9rem; line-height: 1.1; }
.score-sub { font-size: 0.75rem; opacity: 0.8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.shots {
  position: absolute; left: 0; right: 0; top: calc(env(safe-area-inset-top) + 72px);
  display: flex; gap: 6px; padding: 0 12px; overflow-x: auto; scrollbar-width: none;
}
.shot {
  flex: none; display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 600;
}
.shot.current { border-color: #ffd54f; box-shadow: 0 0 0 2px #ffd54f inset; }
.shot.done { color: #a5d6a7 !important; }
.hint {
  position: absolute; left: 12px; right: 12px; top: calc(env(safe-area-inset-top) + 116px);
  padding: 8px 12px; border-radius: 12px; font-size: 0.9rem; text-align: center;
}
.bottom { position: absolute; left: 0; right: 0; bottom: 0; padding: 0 12px calc(env(safe-area-inset-bottom) + 16px); }
.caption {
  margin: 0 auto 12px; max-width: 640px; max-height: 6.2em; overflow: hidden;
  padding: 8px 12px; border-radius: 10px; background: rgba(0, 0, 0, 0.6);
  font-size: 1.1rem; line-height: 1.35; text-align: center; display: flex; flex-direction: column-reverse;
}
.controls { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; }
.mic { justify-self: start; }
.mic :deep(.text-body-2), .mic :deep(.text-caption) { color: #fff !important; }
.mic :deep(.v-alert) { position: absolute; left: 12px; right: 12px; bottom: calc(100% + 8px); }
.controls { position: relative; }
.side-btns { justify-self: end; display: flex; gap: 8px; }
.shutter {
  width: 76px; height: 76px; border-radius: 50%;
  border: 5px solid #fff; background: rgba(255, 255, 255, 0.25);
  display: grid; place-items: center;
  transition: transform 0.1s;
}
.shutter:active { transform: scale(0.92); }
.shutter:disabled { opacity: 0.5; }
.ar-help { margin-top: 12px; padding: 8px 12px; border-radius: 12px; font-size: 0.9rem; display: flex; align-items: center; justify-content: center; }
.ar-start {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: min(320px, calc(100vw - 32px)); padding: 16px; border-radius: 16px; text-align: center;
}
.flash { position: absolute; inset: 0; background: #fff; opacity: 0.7; pointer-events: none; }
.toast {
  position: absolute; left: 50%; top: 42%; transform: translateX(-50%);
  padding: 10px 18px; border-radius: 24px; font-weight: 800; font-size: 1.05rem;
  background: rgba(46, 125, 50, 0.92); white-space: nowrap; pointer-events: none;
}
.pop-enter-active { transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1); }
.pop-leave-active { transition: all 0.4s; }
.pop-enter-from { opacity: 0; transform: translate(-50%, 20px) scale(0.8); }
.pop-leave-to { opacity: 0; transform: translate(-50%, -20px); }
.field-tags { position: absolute; left: 0; top: 0; display: flex; flex-direction: column; gap: 4px; pointer-events: none; }
.field-tags--side { left: 12px; top: auto; bottom: 200px; transform: none; max-width: 60vw; }
.tag { background: rgba(0, 0, 0, 0.6); border-left: 3px solid #81c784; padding: 3px 8px; border-radius: 6px; font-size: 0.8rem; white-space: nowrap; }
.pin { position: absolute; left: 0; top: 0; display: flex; align-items: flex-start; margin: -22px 0 0 -11px; pointer-events: none; }
.pin--left { flex-direction: row-reverse; translate: -100% 0; margin-left: 11px; }
.pin--left .pin-note { margin: 0 2px 0 0; }
.pin-note { background: rgba(0, 0, 0, 0.7); border: 1px solid #ffd54f; padding: 4px 8px; border-radius: 8px; font-size: 0.85rem; max-width: 200px; margin-left: 2px; }
.reticle {
  position: absolute; left: 50%; top: 50%; width: 56px; height: 56px; margin: -28px 0 0 -28px;
  border: 3px dashed rgba(255, 255, 255, 0.5); border-radius: 50%; pointer-events: none;
}
.reticle.on { border-style: solid; border-color: #ffd54f; }
.anchor-dot { position: absolute; left: 0; top: 0; margin: -16px 0 0 -14px; font-size: 28px; pointer-events: none; }
.ring-mark {
  position: absolute; left: 0; top: 0; margin: -18px 0 0 -18px;
  display: inline-flex; align-items: center; gap: 4px; padding: 6px 10px; border-radius: 18px;
  background: rgba(0, 0, 0, 0.55); border: 2px solid #fff; color: #fff; font-size: 0.8rem; font-weight: 700;
}
.ring-mark.current { border-color: #ffd54f; }
.ring-mark.done { border-color: #81c784; color: #c8e6c9; }
</style>
