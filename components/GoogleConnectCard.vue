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
</script>

<template>
  <v-card class="mb-4">
    <v-card-title>Google Photos</v-card-title>
    <v-card-text>
      <v-alert v-if="flash" type="info" density="compact" class="mb-2" closable @click:close="flash = ''">{{ flash }}</v-alert>
      <v-alert v-if="g.error.value" type="error" density="compact" class="mb-2">{{ g.error.value }}</v-alert>
      <p v-if="!signedIn" class="text-medium-emphasis">Sign in first to connect Google Photos.</p>
      <p v-else-if="!online" class="text-medium-emphasis">Offline. Connecting needs internet; the rest of the app works without it.</p>
      <template v-else-if="g.status.value">
        <p v-if="!g.status.value.configured" class="text-medium-emphasis">Google integration is not configured on the server.</p>
        <p v-else-if="g.connected.value">Connected. Use "Pick from Google Photos" on a foray to import photos you choose.</p>
        <p v-else-if="g.status.value.connected">Connected with outdated permissions. Reconnect to grant the Photos Picker scope.</p>
        <p v-else class="text-medium-emphasis">Not connected. Read-only access to photos you pick.</p>
      </template>
    </v-card-text>
    <v-card-actions>
      <v-btn v-if="g.status.value?.connected" variant="text" :disabled="!online" @click="g.disconnect()">Disconnect</v-btn>
      <v-btn v-if="!g.connected.value" color="primary" :disabled="!online || !signedIn || g.status.value?.configured === false" @click="g.connect()">
        {{ g.status.value?.connected ? 'Reconnect' : 'Connect' }}
      </v-btn>
    </v-card-actions>
  </v-card>
</template>
