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

const pill = computed(() => {
  if (!signedIn.value) return { text: 'Sign in first', color: 'grey', icon: 'mdi-lock-outline' }
  if (connected.value) return { text: 'Connected', color: 'success', icon: 'mdi-check-circle-outline' }
  return { text: 'Not connected', color: 'info', icon: 'mdi-link-off' }
})
</script>

<template>
  <v-card class="fa-card">
    <v-card-text>
      <div class="d-flex align-center ga-3 mb-2">
        <v-avatar color="accent" variant="tonal" size="40"><v-icon>mdi-leaf</v-icon></v-avatar>
        <h3 class="text-subtitle-1 font-weight-bold flex-grow-1">iNaturalist</h3>
        <v-chip class="fa-pill" :color="pill.color" variant="tonal" size="small" :prepend-icon="pill.icon">{{ pill.text }}</v-chip>
      </div>

      <p class="text-body-2 text-medium-emphasis mb-3">Publish your finds as observations. Finds are queued while you are offline.</p>

      <transition name="notice">
        <v-alert v-if="notice" type="success" variant="tonal" density="compact" class="mb-3" icon="mdi-party-popper">{{ notice }}</v-alert>
      </transition>
      <transition name="notice">
        <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-3">{{ error }}</v-alert>
      </transition>

      <div v-if="!signedIn" class="text-body-2">Sign in above to connect iNaturalist.</div>
      <template v-else-if="connected">
        <div class="text-body-2">Connected<span v-if="inatLogin"> as <strong>{{ inatLogin }}</strong></span></div>
        <v-btn class="mt-2" variant="text" color="medium-emphasis" size="small" :loading="busy" :disabled="!online" @click="disconnect">Disconnect</v-btn>
      </template>
      <template v-else>
        <v-btn color="primary" variant="flat" size="large" block :loading="busy" :disabled="!online" @click="connect">Connect iNaturalist</v-btn>
      </template>
      <div v-if="signedIn && !online" class="text-caption mt-2">Offline: connecting needs a connection.</div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.notice-enter-active { animation: fa-pop .35s var(--fa-ease); }
.notice-leave-active { transition: opacity .2s; }
.notice-leave-to { opacity: 0; }
</style>
