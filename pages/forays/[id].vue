<script setup lang="ts">
// Live voice transcription via the browser Web Speech API; final segments
// are saved to Supabase as they arrive.
const route = useRoute()
const supabase = useSupabaseClient()
const id = route.params.id as string

const listening = ref(false)
const interim = ref('')
const supported = ref(true)
let recognition: any = null

const { data: segments, refresh } = await useAsyncData(`segments-${id}`, async () => {
  const { data, error } = await supabase
    .from('transcript_segments')
    .select('id, text, created_at')
    .eq('foray_id', id)
    .order('created_at')
  if (error) throw error
  return data
})

async function saveSegment(text: string) {
  const { error } = await supabase.from('transcript_segments').insert({ foray_id: id, text })
  if (error) throw error
  await refresh()
}

onMounted(() => {
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
  recognition.onend = () => {
    if (listening.value) recognition.start()
  }
})

onBeforeUnmount(() => {
  listening.value = false
  recognition?.stop()
})

function toggle() {
  listening.value = !listening.value
  listening.value ? recognition.start() : recognition.stop()
}
</script>

<template>
  <v-alert v-if="!supported" type="warning" variant="tonal" class="mb-4">
    Speech recognition is not supported in this browser.
  </v-alert>
  <v-btn
    :color="listening ? 'error' : 'primary'"
    :prepend-icon="listening ? 'mdi-stop' : 'mdi-microphone'"
    :disabled="!supported"
    class="mb-4"
    @click="toggle"
  >
    {{ listening ? 'Stop' : 'Start' }} transcription
  </v-btn>
  <v-list>
    <v-list-item v-for="s in segments" :key="s.id" :title="s.text" :subtitle="new Date(s.created_at).toLocaleTimeString()" />
    <v-list-item v-if="interim" :title="interim" class="text-medium-emphasis" />
  </v-list>
</template>
