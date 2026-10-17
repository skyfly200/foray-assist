<template>
  <v-dialog v-model="open" max-width="440" @after-leave="stop">
    <template #activator="{ props: act }">
      <slot name="activator" :props="act">
        <v-btn v-bind="act" variant="tonal" rounded="xl" prepend-icon="mdi-qrcode-scan">Scan QR code</v-btn>
      </slot>
    </template>
    <v-card class="fa-card" title="Scan the foray QR code">
      <v-card-text>
        <div class="viewfinder">
          <video ref="video" playsinline muted class="video" data-testid="qr-video" />
          <div class="frame" />
        </div>
        <p class="text-caption text-medium-emphasis mt-2">
          Point the camera at the code in the other person's Share dialog. This works without signal.
        </p>
        <v-alert v-if="error" type="warning" variant="tonal" density="compact" class="mt-2">{{ error }}</v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="open = false">Cancel</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
// Reads a join QR with the camera, entirely on the device. Uses the browser's BarcodeDetector
// where it exists (Chrome on Android) and falls back to jsQR on canvas frames (iOS Safari,
// desktop Firefox). Emits only when the text parses as a join code or join link.
import { parseJoinLink } from '~/utils/sharing'

const emit = defineEmits<{ scanned: [link: NonNullable<ReturnType<typeof parseJoinLink>>] }>()
const open = ref(false)
const error = ref('')
const video = ref<HTMLVideoElement | null>(null)
let stream: MediaStream | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let canvas: HTMLCanvasElement | null = null

watch(open, async (v) => {
  if (!v) return stop()
  error.value = ''
  await nextTick()
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
  } catch (e: any) {
    error.value = e?.name === 'NotAllowedError'
      ? 'Camera access was blocked. Allow it in the browser settings, or type the code instead.'
      : 'No camera found. Type the code instead.'
    return
  }
  if (!open.value || !video.value) return stop()
  video.value.srcObject = stream
  await video.value.play().catch(() => {})
  void loop(await makeDecoder())
})

type Decode = (v: HTMLVideoElement) => Promise<string | null>

async function makeDecoder(): Promise<Decode> {
  const BD = (globalThis as any).BarcodeDetector
  if (BD) {
    try {
      const formats: string[] = await BD.getSupportedFormats?.() ?? ['qr_code']
      if (formats.includes('qr_code')) {
        const det = new BD({ formats: ['qr_code'] })
        return async (v) => (await det.detect(v))?.[0]?.rawValue ?? null
      }
    } catch { /* fall through to jsQR */ }
  }
  const jsQR: any = (await import('jsqr')).default ?? (await import('jsqr'))
  return async (v) => {
    const w = v.videoWidth
    const h = v.videoHeight
    if (!w || !h) return null
    // Scale down: jsQR is fast enough at ~640 px and the QR fills much of the frame.
    const s = Math.min(1, 640 / Math.max(w, h))
    canvas ??= document.createElement('canvas')
    canvas.width = Math.round(w * s)
    canvas.height = Math.round(h * s)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
    return jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data ?? null
  }
}

async function loop(decode: Decode) {
  if (!open.value || !video.value || !stream) return
  let text: string | null = null
  try { text = await decode(video.value) } catch { /* frame not ready */ }
  if (text) {
    const link = parseJoinLink(text)
    if (link) {
      emit('scanned', link)
      open.value = false
      return
    }
    error.value = "That QR code isn't a foray join code."
  }
  timer = setTimeout(() => loop(decode), 200)
}

function stop() {
  clearTimeout(timer)
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
  if (video.value) video.value.srcObject = null
}

onBeforeUnmount(stop)
</script>

<style scoped>
.viewfinder { position: relative; aspect-ratio: 1; border-radius: var(--fa-radius-sm); overflow: hidden; background: #000; }
.video { width: 100%; height: 100%; object-fit: cover; display: block; }
.frame { position: absolute; inset: 15%; border: 3px solid rgba(255, 255, 255, 0.85); border-radius: 16px; pointer-events: none; }
</style>
