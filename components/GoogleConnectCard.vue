<script setup lang="ts">
const { online, signedIn } = useSync()
const g = useGooglePhotos()
const flash = ref('')

onMounted(() => {
  const q = new URLSearchParams(window.location.search).get('google')
  if (q) flash.value = ({ connected: 'Google Photos connected.', denied: 'Google access was declined.', error: 'Google connection failed. Try again.' } as any)[q] ?? ''
  if (signedIn.value && online.value) g.refreshStatus()
})
watch([signedIn, online], ([s, o]) => { if (s && o) g.refreshStatus() })

const pill = computed(() => {
  if (!signedIn.value) return { text: 'Sign in first', color: 'grey', icon: 'mdi-lock-outline' }
  if (!online.value) return { text: 'Offline', color: 'warning', icon: 'mdi-wifi-off' }
  const s: any = g.status.value
  if (!s) return { text: 'Checking', color: 'grey', icon: 'mdi-dots-horizontal' }
  if (!s.configured) return { text: 'Unavailable', color: 'grey', icon: 'mdi-cloud-off-outline' }
  if (g.connected.value) return { text: 'Connected', color: 'success', icon: 'mdi-check-circle-outline' }
  if (s.connected) return { text: 'Needs reconnect', color: 'warning', icon: 'mdi-refresh-alert' }
  return { text: 'Not connected', color: 'info', icon: 'mdi-link-off' }
})
</script>

<template>
  <v-card class="fa-card connect-card mb-4">
    <v-card-text>
      <div class="d-flex align-center ga-3 mb-2">
        <v-avatar color="primary" variant="tonal" size="40"><v-icon>mdi-image-multiple-outline</v-icon></v-avatar>
        <h3 class="text-subtitle-1 font-weight-bold flex-grow-1">Google Photos</h3>
        <v-chip class="fa-pill" :color="pill.color" variant="tonal" size="small" :prepend-icon="pill.icon">{{ pill.text }}</v-chip>
      </div>

      <p class="text-body-2 text-medium-emphasis mb-3">Pick photos from your library to add to a foray. Read-only access to photos you choose.</p>

      <transition name="notice">
        <v-alert v-if="flash" :type="flash.includes('connected.') ? 'success' : 'warning'" variant="tonal" density="compact" class="mb-3" closable @click:close="flash = ''">{{ flash }}</v-alert>
      </transition>
      <transition name="notice">
        <v-alert v-if="g.error.value" type="error" variant="tonal" density="compact" class="mb-3">{{ g.error.value }}</v-alert>
      </transition>

      <p v-if="!signedIn" class="text-body-2 text-medium-emphasis">Sign in first to connect Google Photos.</p>
      <p v-else-if="!online" class="text-body-2 text-medium-emphasis">Offline. Connecting needs internet; the rest of the app works without it.</p>
      <template v-else-if="g.status.value">
        <p v-if="!g.status.value.configured" class="text-body-2 text-medium-emphasis">Google integration is not configured on the server.</p>
        <p v-else-if="g.connected.value" class="text-body-2">Connected. Use "Pick from Google Photos" on a foray to import photos you choose.</p>
        <p v-else-if="g.status.value.connected" class="text-body-2">Connected with outdated permissions. Reconnect to grant the Photos Picker scope.</p>
        <p v-else class="text-body-2 text-medium-emphasis">Not connected. Read-only access to photos you pick.</p>
      </template>
    </v-card-text>
    <v-card-actions class="flex-column align-stretch px-4 pb-4 ga-1">
      <v-btn v-if="!g.connected.value" color="primary" variant="flat" size="large" block :disabled="!online || !signedIn || g.status.value?.configured === false" @click="g.connect()">
        {{ g.status.value?.connected ? 'Reconnect' : 'Connect' }}
      </v-btn>
      <v-btn v-if="g.status.value?.connected" variant="text" color="medium-emphasis" size="small" :disabled="!online" @click="g.disconnect()">Disconnect</v-btn>
    </v-card-actions>
  </v-card>
</template>

<style scoped>
.notice-enter-active { animation: fa-pop .35s var(--fa-ease); }
.notice-leave-active { transition: opacity .2s; }
.notice-leave-to { opacity: 0; }
</style>
