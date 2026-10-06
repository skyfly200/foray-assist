<template>
  <div class="voice-recorder">
    <div class="d-flex align-center ga-3 flex-wrap">
      <v-btn
        class="fa-fab"
        :class="{ 'fa-recording': recording }"
        :color="recording ? 'error' : 'primary'"
        :icon="recording ? 'mdi-stop' : 'mdi-microphone'"
        size="x-large"
        :loading="saving"
        :disabled="saving"
        :aria-label="recording ? 'Stop recording' : 'Record voice note'"
        @click="recording ? stopRecording() : startRecording()"
      />
      <template v-if="recording">
        <span class="text-body-2" aria-live="off">{{ elapsedLabel }}</span>
        <div v-if="mode !== 'speech'" class="meter" aria-hidden="true"><div class="meter-fill" :style="{ width: Math.round(level * 100) + '%' }" /></div>
      </template>
      <span v-else class="text-body-2 text-medium-emphasis">{{ saving ? 'Saving…' : 'Record note' }}</span>
      <span v-if="!recording && engineHint" class="text-caption text-medium-emphasis">{{ engineHint }}</span>
    </div>

    <v-alert v-if="showSpeechNotice" type="info" variant="tonal" density="compact" class="mt-3" icon="mdi-cloud-outline">
      Using online speech recognition — download the voice model for offline use
    </v-alert>
    <v-alert v-if="!isCached && status !== 'downloading' && !recording" type="info" variant="tonal" density="compact" class="mt-3">
      <div>{{ speechAvailable ? 'Offline voice transcription needs the on-device model.' : 'Voice transcription needs the on-device model. You can still record now and transcribe later.' }}</div>
      <v-btn class="mt-2" size="small" color="primary" prepend-icon="mdi-download" :disabled="recording || offline" @click="download">
        Download voice model (~{{ models[model].approxMB }} MB)
      </v-btn>
      <div v-if="offline" class="text-caption mt-1">You are offline; connect to download it.</div>
    </v-alert>
    <div v-if="status === 'downloading'" class="mt-3">
      <v-progress-linear :model-value="progress" height="8" rounded color="primary" />
      <div class="text-caption mt-1">Downloading voice model {{ progress }}%</div>
    </div>
    <v-alert v-if="status === 'error'" type="warning" variant="tonal" density="compact" class="mt-3">
      Voice model problem: {{ whisperError }}
    </v-alert>
    <v-alert v-if="micError" type="error" variant="tonal" density="compact" class="mt-3">{{ micError }}</v-alert>
    <v-alert v-if="notice" type="info" variant="tonal" density="compact" class="mt-3" closable @click:close="notice = ''">{{ notice }}</v-alert>

    <v-sheet v-if="recording" class="interim pa-3 mt-3" rounded border>
      <div v-if="interim" class="text-body-2">{{ interim }}</div>
      <div v-else class="text-body-2 text-medium-emphasis">
        {{ mode === 'speech' ? 'Listening… words appear as you speak.' : mode === 'whisper' ? 'Listening… text appears after a short pause.' : 'Recording audio (no transcript until the model is downloaded).' }}
      </div>
      <div v-if="pendingChunks > 0" class="text-caption text-medium-emphasis mt-1">Transcribing…</div>
    </v-sheet>

    <v-list v-if="notes.length" lines="three" density="compact" class="mt-3 pa-0">
      <v-list-item v-for="n in notes" :key="n.id" class="px-0">
        <div class="d-flex align-center ga-2 flex-wrap mb-1">
          <span class="text-caption text-medium-emphasis">{{ when(n.at) }}</span>
          <v-chip size="x-small">{{ n.model }}</v-chip>
        </div>
        <audio v-if="urls[n.id]" :src="urls[n.id]" controls preload="none" class="w-100 mb-1" />
        <div v-if="busyIds.has(n.id)" class="text-body-2 text-medium-emphasis">Transcribing…</div>
        <div v-else-if="n.transcript" class="text-body-2">{{ n.transcript }}</div>
        <div v-else class="text-body-2 text-medium-emphasis">No transcript yet.</div>
        <div v-if="rowErrors[n.id]" class="text-caption text-error">{{ rowErrors[n.id] }}</div>
        <div class="d-flex ga-1 mt-1">
          <v-btn
            size="small"
            variant="text"
            prepend-icon="mdi-text-recognition"
            :disabled="!n.audio || !isCached || busyIds.has(n.id) || recording"
            @click="retranscribe(n)"
          >
            {{ isCached ? `Re-transcribe (${model})` : 'Transcribe (needs model)' }}
          </v-btn>
          <v-spacer />
          <v-btn size="small" variant="text" color="error" prepend-icon="mdi-delete" :disabled="busyIds.has(n.id)" @click="remove(n)">
            Delete
          </v-btn>
        </div>
      </v-list-item>
    </v-list>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useLiveQuery } from '~/composables/useFinds'
import type { VoiceNote } from '~/utils/db'
import { Chunker, cleanTranscript, decodeBlobTo16kMono, describeMicError, joinTranscript, releaseActiveRecorder, startRecorder, type RecorderHandle } from '~/utils/audio'
import { stopActiveSpeech, useWebSpeech, webSpeechSupported } from '~/composables/useWebSpeech'

const props = defineProps<{ forayId: string; specimenRowId?: string }>()

const {
  model, modelTag, models, status, progress, isCached, error: whisperError, download, transcribe,
} = useWhisper()

const webSpeech = useWebSpeech()

type Mode = 'whisper' | 'speech' | 'raw'
const mode = ref<Mode>('raw')
const notice = ref('')
const recording = ref(false)
const saving = ref(false)
const interim = ref('')
const pendingChunks = ref(0)
const micError = ref('')
const level = ref(0)
const elapsed = ref(0)
const offline = ref(false)
const busyIds = ref(new Set<string>())
const rowErrors = ref<Record<string, string>>({})

const elapsedLabel = computed(() => `${Math.floor(elapsed.value / 60)}:${String(elapsed.value % 60).padStart(2, '0')}`)
const whisperUsable = computed(() => isCached.value && status.value !== 'error')
const speechAvailable = computed(() => webSpeechSupported() && !offline.value)
const showSpeechNotice = computed(() => (recording.value ? mode.value === 'speech' : !whisperUsable.value && speechAvailable.value))
const engineHint = computed(() => (whisperUsable.value ? `On-device Whisper (${model.value})` : ''))
const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })

const notes = useLiveQuery<VoiceNote[]>(async () => {
  const db = useDb()
  const rows = props.specimenRowId
    ? await db.voiceNotes.where('specimenRowId').equals(props.specimenRowId).toArray()
    : (await db.voiceNotes.where('forayId').equals(props.forayId).toArray()).filter((n) => !n.specimenRowId)
  return rows.sort((a, b) => a.at.localeCompare(b.at))
}, [])

// Object URLs for playback, keyed by note id.
const urls = ref<Record<string, string>>({})
watch(
  notes,
  (list) => {
    const keep = new Set(list.map((n) => n.id))
    for (const id of Object.keys(urls.value)) {
      if (!keep.has(id)) {
        URL.revokeObjectURL(urls.value[id])
        delete urls.value[id]
      }
    }
    for (const n of list) if (n.audio && !urls.value[n.id]) urls.value[n.id] = URL.createObjectURL(n.audio)
  },
  { immediate: true },
)

let handle: RecorderHandle | null = null
let speech: { stop: () => Promise<string> } | null = null
let speechText = ''
let chunker: Chunker | null = null
let timer: ReturnType<typeof setInterval> | null = null
let chunkJobs: Promise<void>[] = []
let chunkFailed = false
let startedAt = ''
let transcribeLive = false

const updOnline = () => (offline.value = !navigator.onLine)
const onHidden = () => {
  // Android stops the mic when the page is hidden; save what we have instead of leaving a dead recording.
  if (document.visibilityState === 'hidden' && recording.value && mode.value === 'speech') {
    notice.value = 'Recording stopped because the app went to the background. What was captured has been saved.'
    stopRecording()
  }
}
onMounted(() => {
  updOnline()
  window.addEventListener('online', updOnline)
  window.addEventListener('offline', updOnline)
  document.addEventListener('visibilitychange', onHidden)
})

function handleChunk(chunk: Float32Array) {
  if (!transcribeLive) return
  pendingChunks.value++
  const job = transcribe(chunk)
    .then((t) => {
      const clean = cleanTranscript(t)
      if (clean) interim.value = joinTranscript(interim.value, clean)
    })
    .catch(() => { chunkFailed = true })
    .finally(() => { pendingChunks.value-- })
  chunkJobs.push(job)
}

function beginTimer() {
  startedAt = new Date().toISOString()
  recording.value = true
  elapsed.value = 0
  const t0 = Date.now()
  timer = setInterval(() => {
    elapsed.value = Math.floor((Date.now() - t0) / 1000)
    level.value = handle?.level() ?? 0
  }, 150)
}

async function startRecording() {
  if (recording.value || saving.value) return
  micError.value = ''
  notice.value = ''
  interim.value = ''
  speechText = ''
  chunkJobs = []
  chunkFailed = false
  updOnline()
  // Pick exactly one mic consumer: Web Speech and getUserMedia must never overlap.
  mode.value = whisperUsable.value ? 'whisper' : speechAvailable.value ? 'speech' : 'raw'
  transcribeLive = mode.value === 'whisper'
  chunker = new Chunker()

  if (mode.value === 'speech') {
    releaseActiveRecorder('replaced') // another component's getUserMedia capture
    await stopActiveSpeech()
    await new Promise((r) => setTimeout(r, 150))
    try {
      speech = webSpeech.start({
        onText: (t) => { speechText = t; interim.value = t },
        onError: (m) => {
          micError.value = m
          if (recording.value) stopRecording()
        },
        onPreempted: () => {
          notice.value = 'Another recording started, so this one was stopped and saved.'
          if (recording.value) stopRecording()
        },
      })
    } catch (e: any) {
      micError.value = e?.message ?? String(e)
      return
    }
    beginTimer()
    return
  }

  await stopActiveSpeech()
  try {
    handle = await startRecorder({
      onSamples: (s) => { for (const c of chunker!.push(s)) handleChunk(c) },
      onInterrupted: (reason) => {
        notice.value = reason === 'replaced'
          ? 'Another recording started, so this one was stopped and saved.'
          : 'Recording stopped because the app went to the background or the microphone was taken. What was captured has been saved.'
        if (recording.value) stopRecording()
      },
    })
  } catch (e: any) {
    micError.value = describeMicError(e).message
    handle = null
    return
  }
  beginTimer()
  // Warm up the model from cache (never touches the network).
  if (transcribeLive) download().catch(() => {})
}

async function stopRecording() {
  if (!handle && !speech) return
  if (saving.value) return
  saving.value = true
  if (timer) clearInterval(timer)
  timer = null
  recording.value = false
  try {
    let blob: Blob | undefined
    let text = ''
    let tag = 'none'
    if (speech) {
      const s = speech
      speech = null
      text = ((await s.stop()) || speechText).trim()
      tag = 'web-speech'
    } else {
      const res = await handle!.stop()
      handle = null
      for (const c of chunker!.flush()) handleChunk(c)
      await Promise.all(chunkJobs)
      text = interim.value.trim()
      blob = res.blob.size ? res.blob : undefined
      tag = transcribeLive ? modelTag.value : 'none'
    }
    if (!blob && !text) {
      notice.value = notice.value || 'Nothing was recorded.'
    } else {
      const id = newId()
      const now = nowIso()
      const db = useDb()
      await db.transaction('rw', db.voiceNotes, db.outbox, async () => {
        await db.voiceNotes.add({
          id,
          forayId: props.forayId,
          ...(props.specimenRowId ? { specimenRowId: props.specimenRowId } : {}),
          audio: blob,
          transcript: text,
          model: tag,
          at: startedAt,
          updatedAt: now,
        })
        await enqueue('voiceNotes', id)
      })
      if (chunkFailed) rowErrors.value[id] = 'Some audio could not be transcribed. Use Re-transcribe to retry.'
    }
    interim.value = ''
  } catch (e: any) {
    micError.value = `Could not save the voice note: ${e?.message ?? e}`
  } finally {
    saving.value = false
    chunker = null
    level.value = 0
  }
}

async function retranscribe(n: VoiceNote) {
  if (!n.audio) return
  busyIds.value = new Set(busyIds.value).add(n.id)
  delete rowErrors.value[n.id]
  try {
    const pcm = await decodeBlobTo16kMono(n.audio)
    const text = cleanTranscript(await transcribe(pcm))
    const db = useDb()
    await db.transaction('rw', db.voiceNotes, db.outbox, async () => {
      await db.voiceNotes.update(n.id, { transcript: text, model: modelTag.value, updatedAt: nowIso() })
      await enqueue('voiceNotes', n.id)
    })
  } catch (e: any) {
    rowErrors.value[n.id] = `Transcription failed: ${e?.message ?? e}`
  } finally {
    const s = new Set(busyIds.value)
    s.delete(n.id)
    busyIds.value = s
  }
}

async function remove(n: VoiceNote) {
  const db = useDb()
  await db.transaction('rw', db.voiceNotes, db.outbox, async () => {
    await db.voiceNotes.delete(n.id)
    await enqueue('voiceNotes', n.id, 'delete')
  })
}

onBeforeUnmount(() => {
  window.removeEventListener('online', updOnline)
  window.removeEventListener('offline', updOnline)
  document.removeEventListener('visibilitychange', onHidden)
  if (timer) clearInterval(timer)
  // Abandon an in-progress recording on navigation: release the mic.
  handle?.stop().catch(() => {})
  speech?.stop().catch(() => {})
  for (const u of Object.values(urls.value)) URL.revokeObjectURL(u)
})
</script>

<style scoped>
.meter {
  width: 80px;
  height: 6px;
  border-radius: 3px;
  background: rgba(128, 128, 128, 0.25);
  overflow: hidden;
}
.meter-fill {
  height: 100%;
  background: rgb(var(--v-theme-error));
  transition: width 0.12s linear;
}
.interim {
  max-height: 160px;
  overflow-y: auto;
}
</style>
