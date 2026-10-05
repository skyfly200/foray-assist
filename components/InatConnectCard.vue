<script setup lang="ts">
const { connected, inatLogin, signedIn, online, refreshStatus } = usePublish()
const busy = ref(false)
const error = ref('')
const notice = ref('')

onMounted(() => {
  const q = new URLSearchParams(window.location.search).get('inat')
  if (q === 'connected') notice.value = 'iNaturalist connected.'
  else if (q) error.value = 'iNaturalist connection failed or was cancelled. Try again.'
  if (signedIn.value && online.value) refreshStatus()
})

async function connect() {
  busy.value = true; error.value = ''
  try {
    const r: any = await apiFetch('/api/inat/auth-url')
    window.location.href = r.url
  } catch (e: any) {
    error.value = e?.statusMessage || e?.message || 'Could not start connection'
    busy.value = false
  }
}
async function disconnect() {
  busy.value = true; error.value = ''
  try {
    await apiFetch('/api/inat/disconnect', { method: 'POST' })
    connected.value = false
  } catch (e: any) {
    error.value = e?.statusMessage || e?.message || 'Disconnect failed'
  } finally { busy.value = false }
}
</script>

<template>
  <v-card variant="tonal">
    <v-card-title>iNaturalist</v-card-title>
    <v-card-text>
      <v-alert v-if="notice" type="success" variant="tonal" density="compact" class="mb-3">{{ notice }}</v-alert>
      <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-3">{{ error }}</v-alert>
      <div v-if="!signedIn" class="text-body-2">Sign in above to connect iNaturalist.</div>
      <template v-else-if="connected">
        <div class="mb-2">Connected<span v-if="inatLogin"> as <strong>{{ inatLogin }}</strong></span></div>
        <v-btn variant="outlined" :loading="busy" :disabled="!online" @click="disconnect">Disconnect</v-btn>
      </template>
      <template v-else>
        <div class="text-body-2 mb-2">Connect to publish finds as observations. Finds are queued while you are offline.</div>
        <v-btn color="primary" :loading="busy" :disabled="!online" @click="connect">Connect iNaturalist</v-btn>
      </template>
      <div v-if="signedIn && !online" class="text-caption mt-1">Offline: connecting needs a connection.</div>
    </v-card-text>
  </v-card>
</template>
