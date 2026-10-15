<template>
  <div class="voice-recorder">
    <!-- listOnly (Review mode): just the saved notes, to replay, re-transcribe or fill the form from. -->
    <template v-if="!listOnly">
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
        <div v-if="mode !== 'speech' || keepsAudio" class="meter" aria-hidden="true"><div class="meter-fill" :style="{ width: Math.round(level * 100) + '%' }" /></div>
      </template>
      <span v-else class="text-body-2 text-medium-emphasis">{{ saving ? 'Saving…' : 'Record note' }}</span>
      <span v-if="!recording && engineHint" class="text-caption text-medium-emphasis">{{ engineHint }}</span>
    </div>

    <v-alert v-if="showSpeechNotice" type="info" variant="tonal" density="compact" class="mt-3" icon="mdi-cloud-outline">
      Using online speech recognition. Download the voice model for offline use
    </v-alert>
    <v-alert v-if="whisperRouted && !isCached && status !== 'downloading' && !recording" type="info" variant="tonal" density="compact" class="mt-3">
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

    </template>

    <v-sheet v-if="specimenRowId && (filled.length || (recording && fillsForm))" class="pa-3 mt-3 voice-filled" rounded border>
      <div class="d-flex align-center ga-2">
        <v-icon icon="mdi-form-select" size="18" color="primary" />
        <span class="text-body-2 font-weight-medium">{{ filled.length ? 'Filled in from your voice' : 'Listening for details to fill in the form' }}</span>
        <v-spacer />
        <v-btn v-if="filled.length && !recording" size="small" variant="text" prepend-icon="mdi-undo" @click="undoFill">Undo</v-btn>
        <v-btn v-if="filled.length && !recording" size="small" variant="text" icon="mdi-close" aria-label="Dismiss" @click="filled = []" />
      </div>
      <div v-if="!filled.length" class="text-caption text-medium-emphasis mt-1">
        Try: "brown convex cap, 6 cm across, white gills, smells like anise, under oaks".
      </div>
      <div v-else class="d-flex flex-wrap ga-1 mt-2">
        <v-chip v-for="f in filled" :key="f.key" size="small" color="primary" variant="tonal">
          <span class="text-medium-emphasis mr-1">{{ f.label }}:</span> {{ f.value }}
        </v-chip>
      </div>
    </v-sheet>

    <v-list v-if="notes.length" lines="three" density="compact" class="pa-0" :class="{ 'mt-3': !listOnly }">
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
            {{ !isCached ? 'Transcribe (needs model)' : n.model === 'web-speech' ? 'Retranscribe with Whisper' : `Re-transcribe (${model})` }}
          </v-btn>
          <v-btn
            v-if="specimenRowId && n.transcript"
            size="small"
            variant="text"
            prepend-icon="mdi-form-select"
            :disabled="recording || busyIds.has(n.id)"
            @click="fillFromNote(n)"
          >
            Fill form
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
import { stopActiveSpeech, useWebSpeech, webSpeechSupported, webSpeechTakesTrack } from '~/composables/useWebSpeech'
import { voiceVocabFor } from '~/composables/useVoiceVocab'
import { updateFieldNotes } from '~/composables/useFinds'
import type { FieldNotes } from '~/utils/db'
import { extractCustomFields, extractFieldNotes, voicePatch, type Extracted } from '~/utils/voiceExtract'
import { FAIL_TEXT, MODELS, failReason, pickStep, runRoute, type ModelId, type RouteStep } from '~/utils/modelRouting'
import { formGroups, visibleKeys, type FieldKey } from '~/utils/fieldForm'

const props = defineProps<{ forayId: string; specimenRowId?: string; listOnly?: boolean }>()

const {
  model, modelTag, models, status, progress, isCached, error: whisperError, download, transcribe,
} = useWhisper()

const webSpeech = useWebSpeech()
// Which model runs, and what to try when it fails, comes from Settings, Model routing
// (the Voice setting for browser speech reorders that route).
const { routing, cooldowns, load: loadRouting, failed: routeFailed } = useModelRouting()

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
// Browser speech is listening to our own mic capture, so the audio is kept for Whisper later.
const keepsAudio = ref(false)

const elapsedLabel = computed(() => `${Math.floor(elapsed.value / 60)}:${String(elapsed.value % 60).padStart(2, '0')}`)
const whisperUsable = computed(() => isCached.value && status.value !== 'error')
const speechAvailable = computed(() => webSpeechSupported() && !offline.value)
const modelUsable = (m: ModelId) => (m === 'whisper' ? whisperUsable.value : m === 'web-speech' ? speechAvailable.value : true)
const MODE: Record<string, Mode> = { whisper: 'whisper', 'web-speech': 'speech', 'record-only': 'raw' }
const speechSteps = computed(() => routing.value.routes.speech)
const plannedStep = computed(() => pickStep(speechSteps.value, { isAvailable: modelUsable, cooldowns }).step)
const whisperRouted = computed(() => speechSteps.value.some((s) => s.model === 'whisper'))
// Browser speech first in the route is the user's own choice; only nag when it is a fallback.
const prefersBrowser = computed(() => speechSteps.value[0]?.model === 'web-speech')
const showSpeechNotice = computed(() => !prefersBrowser.value && (recording.value ? mode.value === 'speech' : plannedStep.value?.model === 'web-speech'))
const engineHint = computed(() => {
  switch (plannedStep.value?.model) {
    case 'web-speech': return prefersBrowser.value ? 'Browser speech recognition' : ''
    case 'whisper': return `On-device Whisper (${model.value})`
    case 'record-only': return 'Recording only, transcribe later'
    default: return ''
  }
})
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
let speechStep: RouteStep | null = null
// Text heard by browser speech before it failed and the recording moved to the next model.
let carried = ''
// Mycology prompt + correction pass for the current recording (see utils/mycoVocab.ts).
let vocab: Awaited<ReturnType<typeof voiceVocabFor>> | null = null

// ---------- filling the field form from speech (utils/voiceExtract.ts) ----------
// While recording a note on a find, the transcript so far is parsed on the device and the
// details it names go straight into the form. Voice only fills empty fields or ones it filled
// itself this recording, never something typed; Undo puts back what was there before.
const fillsForm = computed(() => !!props.specimenRowId)
const { config: formConfig } = useFormConfig()
const filled = ref<{ key: FieldKey; label: string; value: string }[]>([])
let voiceOwned: Extracted = {}
let voiceBefore: Partial<Record<FieldKey, string>> = {}
let extractTimer: ReturnType<typeof setTimeout> | null = null
let extractQueue: Promise<void> = Promise.resolve()

function showFilled() {
  filled.value = formGroups(formConfig.value).flatMap((g) => g.fields)
    .filter((f) => voiceOwned[f.key]).map((f) => ({ key: f.key, label: f.label, value: voiceOwned[f.key]! }))
}

/** Parse `text` and write new values into the find's form. `onlyEmpty`: never replace a value. */
function fillForm(text: string, onlyEmpty = false): Promise<number> {
  const id = props.specimenRowId
  if (!id || !text.trim()) return Promise.resolve(0)
  let count = 0
  const job = extractQueue.then(async () => {
    const corrected = vocab ? vocab.correct(text) : text
    // Only fields shown on the form (Settings → Field form), including the user's own.
    const shown = visibleKeys(formConfig.value)
    const steps = routing.value.routes.extract
    if (!steps.length) return // field filling is switched off in the routing
    const { value: all } = await runRoute(steps, async (s): Promise<Extracted> => {
      switch (s.model) {
        case 'word-list': return { ...extractFieldNotes(corrected, vocab?.names ?? []), ...extractCustomFields(corrected, formConfig.value.custom) }
        default: throw new Error(`${MODELS[s.model].label} cannot fill the form`)
      }
    }, { cooldowns, online: navigator.onLine })
    const ext = Object.fromEntries(Object.entries(all).filter(([k]) => shown.has(k))) as Extracted
    const cur: FieldNotes = (await useDb().specimens.get(id))?.fieldNotes ?? {}
    const patch = voicePatch(cur, ext, onlyEmpty ? {} : voiceOwned)
    const keys = Object.keys(patch) as FieldKey[]
    if (!keys.length) return
    for (const k of keys) {
      if (!(k in voiceBefore)) voiceBefore[k] = cur[k] ?? ''
      voiceOwned[k] = patch[k]
    }
    await updateFieldNotes(id, patch)
    count = keys.length
    showFilled()
  })
  extractQueue = job.catch(() => {})
  return job.then(() => count, () => 0)
}

function scheduleFill() {
  if (!fillsForm.value) return
  if (extractTimer) clearTimeout(extractTimer)
  extractTimer = setTimeout(() => { extractTimer = null; void fillForm(interim.value) }, 350)
}

function resetFill() {
  voiceOwned = {}
  voiceBefore = {}
  filled.value = []
}

async function undoFill() {
  const id = props.specimenRowId
  if (!id) return
  const cur: FieldNotes = (await useDb().specimens.get(id))?.fieldNotes ?? {}
  const patch: FieldNotes = {}
  // Only revert fields still holding what voice wrote; later hand edits stay.
  for (const [k, v] of Object.entries(voiceOwned) as [FieldKey, string][]) {
    if ((cur[k] ?? '') === v) patch[k] = voiceBefore[k] ?? ''
  }
  if (Object.keys(patch).length) await updateFieldNotes(id, patch)
  resetFill()
}

async function fillFromNote(n: VoiceNote) {
  resetFill()
  vocab = await voiceVocabFor(n.forayId).catch(() => null)
  const count = await fillForm(n.transcript, true)
  notice.value = count ? '' : 'Nothing new to fill in: the form already has those details, or none were found.'
}

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
  const job = transcribe(chunk, vocab?.prompt)
    .then((t) => {
      const clean = cleanTranscript(t)
      if (clean) {
        interim.value = joinTranscript(interim.value, clean)
        scheduleFill()
      }
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
  keepsAudio.value = false
  carried = ''
  await loadRouting()
  // Pick exactly one mic consumer: Web Speech and getUserMedia must never overlap, unless
  // Web Speech can listen to our own capture (webSpeechTakesTrack), which also keeps the audio.
  // The first model in the speech route that can run now (Settings, Model routing).
  const picked = pickStep(speechSteps.value, { isAvailable: modelUsable, cooldowns })
  if (!picked.step) {
    micError.value = speechSteps.value.length
      ? `None of the speech models in your routing can run right now (${picked.skipped.map((a) => `${MODELS[a.model].label} ${FAIL_TEXT[a.reason]}`).join(', ')}). Add Record only to the route in Settings, Model routing, to always keep the audio.`
      : 'No speech model is set up. Add one in Settings, Model routing.'
    return
  }
  speechStep = picked.step
  mode.value = MODE[picked.step.model]
  transcribeLive = mode.value === 'whisper'
  chunker = new Chunker()
  vocab = null
  resetFill()
  // Not awaited: keep the mic start inside the tap. Chunks arrive seconds later.
  voiceVocabFor(props.forayId).then((v) => { vocab = v }).catch(() => {})

  if (mode.value === 'speech') {
    const callbacks = {
      onText: (t: string) => { speechText = t; interim.value = t; scheduleFill() },
      onError: (m: string, code?: string) => {
        const reason = failReason({ message: m, code }, navigator.onLine)
        if (speechStep) routeFailed(speechStep, reason)
        // Mic problems would stop the next model too, so only other failures fall back.
        if (recording.value && code !== 'not-allowed' && code !== 'audio-capture') void fallBackFromSpeech(m, reason)
        else {
          micError.value = m
          if (recording.value) stopRecording()
        }
      },
      onPreempted: () => {
        notice.value = 'Another recording started, so this one was stopped and saved.'
        if (recording.value) stopRecording()
      },
    }
    await stopActiveSpeech()
    if (webSpeechTakesTrack()) {
      // One capture: we record the audio and recognition listens to the same track.
      try {
        handle = await startRecorder({
          // Chunks only reach Whisper if browser speech fails and the route falls back to it.
          onSamples: (s) => { if (transcribeLive) for (const c of chunker!.push(s)) handleChunk(c) },
          onInterrupted: (reason) => {
            notice.value = reason === 'replaced'
              ? 'Another recording started, so this one was stopped and saved.'
              : 'Recording stopped because the app went to the background or the microphone was taken. What was captured has been saved.'
            if (recording.value) stopRecording()
          },
        })
        speech = webSpeech.start(callbacks, handle.track())
        keepsAudio.value = true
        beginTimer()
        return
      } catch {
        // Fall back to recognition on its own (no audio kept).
        speech = null
        await handle?.stop().catch(() => {})
        handle = null
      }
    }
    releaseActiveRecorder('replaced') // another component's getUserMedia capture
    await new Promise((r) => setTimeout(r, 150))
    try {
      speech = webSpeech.start(callbacks)
    } catch (e: any) {
      micError.value = e?.message ?? String(e)
      return
    }
    beginTimer()
    return
  }

  await stopActiveSpeech()
  if (!(await startCapture())) return
  beginTimer()
  // Warm up the model from cache (never touches the network).
  if (transcribeLive) download().catch(() => {})
}

/** Start the getUserMedia recorder (Whisper or record only). False when the mic could not start. */
async function startCapture(): Promise<boolean> {
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
    return false
  }
  return true
}

/**
 * Browser speech failed mid-recording: keep what it heard and carry on recording with the next
 * model in the route that can run (Whisper or record only), on the same note.
 */
async function fallBackFromSpeech(message: string, reason: ReturnType<typeof failReason>) {
  const steps = speechSteps.value
  const rest = steps.slice(steps.findIndex((s) => s.model === 'web-speech') + 1)
  const next = pickStep(rest, { isAvailable: modelUsable, cooldowns }).step
  if (!next || !speech) {
    micError.value = message
    if (recording.value) stopRecording()
    return
  }
  const s = speech
  speech = null
  carried = speechText.trim()
  carried = ((await s.stop()) || speechText).trim()
  interim.value = carried
  const shared = !!handle // recognition was listening to our own capture, which keeps running
  if (!shared) await new Promise((r) => setTimeout(r, 150)) // let the recognizer release the mic
  if (!recording.value) return // stopped meanwhile; stopRecording saved the carried text
  speechStep = next
  mode.value = MODE[next.model]
  transcribeLive = mode.value === 'whisper'
  notice.value = `Browser speech ${FAIL_TEXT[reason]}, so this recording carries on with ${MODELS[next.model].label}.`
  if (!shared) {
    chunker = new Chunker()
    if (!(await startCapture())) {
      stopRecording()
      return
    }
    if (!recording.value) { await handle?.stop().catch(() => {}); handle = null; return }
  }
  if (transcribeLive) download().catch(() => {})
}

async function stopRecording() {
  if (!handle && !speech && !carried) return
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
      if (handle) {
        const res = await handle.stop()
        handle = null
        blob = res.blob.size ? res.blob : undefined
      }
    } else if (handle) {
      const res = await handle.stop()
      handle = null
      for (const c of chunker!.flush()) handleChunk(c)
      await Promise.all(chunkJobs)
      text = interim.value.trim()
      blob = res.blob.size ? res.blob : undefined
      tag = transcribeLive ? modelTag.value : 'none'
      if (carried) tag = `web-speech + ${tag}`
    } else {
      text = carried // browser speech failed and the next model never started
      tag = 'web-speech'
    }
    carried = ''
    if (extractTimer) { clearTimeout(extractTimer); extractTimer = null }
    if (text) await fillForm(text)
    if (text && vocab) text = vocab.correct(text)
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
    const v = await voiceVocabFor(n.forayId)
    // Models in the speech route that can transcribe a saved recording, in route order. Whisper
    // can retranscribe browser-speech notes even when browser speech comes first.
    const steps = routing.value.routes.speech.filter((s) => MODELS[s.model].fromAudio)
    const { value } = await runRoute(steps, (s) => {
      switch (s.model) {
        case 'whisper': return transcribe(pcm.slice(), v.prompt) // transcribe() detaches the buffer
        default: throw new Error(`${MODELS[s.model].label} cannot transcribe a recording`)
      }
    }, { isAvailable: modelUsable, cooldowns, online: navigator.onLine })
    const text = v.correct(cleanTranscript(value))
    const db = useDb()
    await db.transaction('rw', db.voiceNotes, db.outbox, async () => {
      await db.voiceNotes.update(n.id, { transcript: text, model: modelTag.value, updatedAt: nowIso() })
      await enqueue('voiceNotes', n.id)
    })
    // Whisper may hear details the first pass missed; add them to empty fields.
    if (props.specimenRowId) {
      resetFill()
      vocab = v
      await fillForm(text, true)
    }
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
  if (extractTimer) clearTimeout(extractTimer)
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
