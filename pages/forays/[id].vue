<script setup lang="ts">
// Foray detail: header, finds (FindList) and live voice transcription via the
// browser Web Speech API. Final segments are saved locally as VoiceNote rows.
import { liveQuery } from 'dexie'

const route = useRoute()
const id = route.params.id as string
const { isForay } = useMode()
const { online } = useSync()

const foray = ref<Foray | null | undefined>(undefined)
const notes = ref<VoiceNote[]>([])
const listening = ref(false)
const interim = ref('')
const supported = ref(true)
const speechError = ref('')
let recognition: any = null
const subs: { unsubscribe(): void }[] = []

async function saveSegment(text: string) {
  if (!text) return
  const now = nowIso()
  const row: VoiceNote = { id: newId(), forayId: id, transcript: text, model: 'web-speech', at: now, updatedAt: now }
  await useDb().voiceNotes.add(row)
  await enqueue('voiceNotes', row.id)
}

onMounted(() => {
  const db = useDb()
  subs.push(
    liveQuery(() => db.forays.get(id)).subscribe({ next: (r) => (foray.value = r ?? null) }),
    liveQuery(() => db.voiceNotes.where('forayId').equals(id).sortBy('at')).subscribe({
      next: (rows) => (notes.value = rows.filter((n) => !n.specimenRowId)),
    }),
  )

  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  if (!SR) {
    supported.value = false
    return
  }
  recognition = new SR()
  recognition.continuous = true
  recognition.interimResults = true
  recognition.onresult = (e: any) => {
    interim.value = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]
      if (r.isFinal) saveSegment(r[0].transcript.trim())
      else interim.value += r[0].transcript
    }
  }
  recognition.onerror = (e: any) => {
    speechError.value =
      e.error === 'network' ? 'Speech recognition needs a network connection.' : `Speech recognition error: ${e.error}`
    if (e.error === 'network' || e.error === 'not-allowed' || e.error === 'service-not-allowed') listening.value = false
  }
  recognition.onend = () => {
    interim.value = ''
    if (listening.value) {
      try {
        recognition.start()
      } catch {
        listening.value = false
      }
    }
  }
})

onBeforeUnmount(() => {
  listening.value = false
  recognition?.stop()
  subs.forEach((s) => s.unsubscribe())
})

function toggle() {
  if (!recognition) return
  speechError.value = ''
  listening.value = !listening.value
  try {
    listening.value ? recognition.start() : recognition.stop()
  } catch {
    listening.value = false
  }
}
</script>

<template>
  <div v-if="foray === null">
    <v-alert type="warning" variant="tonal" class="mb-4">Foray not found.</v-alert>
    <v-btn to="/" prepend-icon="mdi-arrow-left">Back to forays</v-btn>
  </div>
  <template v-else>
    <div class="mb-4">
      <div class="text-h5">{{ foray?.name }}</div>
      <div v-if="foray" class="text-medium-emphasis">
        Started {{ new Date(foray.startedAt).toLocaleString() }}
        <span v-if="foray.endedAt"> · ended {{ new Date(foray.endedAt).toLocaleString() }}</span>
      </div>
    </div>

    <FindList :foray-id="id" />

    <v-divider class="my-4" />
    <div class="text-h6 mb-2">Voice notes</div>
    <v-alert type="info" variant="tonal" density="compact" class="mb-4">
      Needs a network connection; on-device Whisper arrives in M2
    </v-alert>
    <v-alert v-if="!supported" type="warning" variant="tonal" class="mb-4">
      Speech recognition is not supported in this browser.
    </v-alert>
    <v-alert v-else-if="!online && !listening" type="warning" variant="tonal" class="mb-4">
      You are offline; live transcription is unavailable until you reconnect.
    </v-alert>
    <v-alert v-if="speechError" type="error" variant="tonal" closable class="mb-4" @click:close="speechError = ''">
      {{ speechError }}
    </v-alert>
    <v-btn
      :color="listening ? 'error' : 'primary'"
      :prepend-icon="listening ? 'mdi-stop' : 'mdi-microphone'"
      :disabled="!supported || (!online && !listening)"
      :size="isForay ? 'x-large' : 'default'"
      :block="isForay"
      class="mb-4"
      @click="toggle"
    >
      {{ listening ? 'Stop' : 'Start' }} transcription
    </v-btn>
    <v-list :density="isForay ? 'default' : 'compact'">
      <v-list-item
        v-for="n in notes"
        :key="n.id"
        :title="n.transcript"
        :subtitle="new Date(n.at).toLocaleTimeString()"
        prepend-icon="mdi-microphone-outline"
      />
      <v-list-item v-if="interim" :title="interim" class="text-medium-emphasis" />
    </v-list>
  </template>
</template>
