<script setup lang="ts">
import { liveQuery } from 'dexie'

const { online, pending, signedIn, syncing, syncNow } = useSync()

let sb: any = null
const configured = (() => {
  try {
    const cfg: any = useRuntimeConfig().public
    if (!cfg?.supabase?.url || !cfg?.supabase?.key) return false
    sb = useSupabaseClient()
    return true
  } catch { return false }
})()

const email = ref('')
const sending = ref(false)
const message = ref('')
const authError = ref('')
const accountEmail = ref('')
const lastError = ref('')

async function refreshAccount() {
  try {
    const { data } = await sb.auth.getSession()
    accountEmail.value = data?.session?.user?.email ?? ''
  } catch { accountEmail.value = '' }
}
watch(signedIn, refreshAccount)
onMounted(() => {
  if (configured) refreshAccount()
  try {
    const sub = liveQuery(() => useDb().outbox.toArray()).subscribe({
      next: (items) => { lastError.value = items.find((i) => i.lastError)?.lastError ?? '' },
      error: () => {},
    })
    onBeforeUnmount(() => sub.unsubscribe())
  } catch { /* ignore */ }
})

async function signIn() {
  authError.value = ''; message.value = ''
  if (!configured || !email.value) return
  sending.value = true
  try {
    const { error } = await sb.auth.signInWithOtp({
      email: email.value,
      options: { emailRedirectTo: window.location.origin + '/settings' },
    })
    if (error) authError.value = error.message
    else message.value = 'Check your email for the sign-in link.'
  } catch (e: any) {
    authError.value = e?.message ?? 'Sign-in failed'
  } finally { sending.value = false }
}

async function signOut() {
  try { await sb.auth.signOut() } catch { /* ignore */ }
}
</script>

<template>
  <v-container class="settings" style="max-width: 640px">
    <h1 class="text-h5 mb-4">Settings</h1>

    <v-card class="mb-4" variant="tonal">
      <v-card-title>Account &amp; sync</v-card-title>
      <v-card-text>
        <v-alert type="info" variant="text" density="compact" class="mb-3">
          Foray Assist works fully without signing in. Everything is stored on this device;
          signing in only adds optional backup and sync across your devices.
        </v-alert>

        <v-alert v-if="!configured" type="warning" variant="tonal" density="compact" class="mb-3">
          Cloud sync is not configured in this build.
        </v-alert>

        <div v-else-if="signedIn" class="mb-3">
          <div>Signed in<span v-if="accountEmail"> as <strong>{{ accountEmail }}</strong></span></div>
          <v-btn class="mt-2" variant="outlined" @click="signOut">Sign out</v-btn>
        </div>

        <form v-else class="mb-3" @submit.prevent="signIn">
          <v-text-field v-model="email" type="email" label="Email" autocomplete="email"
            density="comfortable" hide-details="auto" :error-messages="authError" />
          <v-btn class="mt-2" type="submit" color="primary" :loading="sending" :disabled="!email">
            Email me a sign-in link
          </v-btn>
          <div v-if="message" class="text-success mt-2">{{ message }}</div>
        </form>

        <v-list density="compact" lines="one">
          <v-list-item title="Connection" :subtitle="online ? 'Online' : 'Offline'" />
          <v-list-item title="Waiting to sync" :subtitle="String(pending)" />
          <v-list-item v-if="lastError" title="Last error" :subtitle="lastError" />
        </v-list>

        <v-btn class="mt-2" :loading="syncing" :disabled="!online || !signedIn || syncing" @click="syncNow()">
          Sync now
        </v-btn>
        <div v-if="!signedIn" class="text-caption mt-1">Sign in to enable syncing.</div>
        <div v-else-if="!online" class="text-caption mt-1">Offline: changes sync when you reconnect.</div>
      </v-card-text>
    </v-card>

    <VoiceModelSettings class="mb-4" />
    <GoogleConnectCard class="mb-4" />
    <InatConnectCard class="mb-4" />
  </v-container>
</template>
