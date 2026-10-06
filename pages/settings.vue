<script setup lang="ts">
import { liveQuery } from 'dexie'

const { online, pending, signedIn, syncing, syncNow } = useSync()

let sb: any = null
const configured = (() => {
  try {
    const cfg: any = useRuntimeConfig().public
    if (!cfg?.syncConfigured || !cfg?.supabase?.url || !cfg?.supabase?.key) return false
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

// Colour-coded status pill for the sync card
const status = computed(() => {
  if (!configured) return { text: 'Not configured', color: 'grey', icon: 'mdi-cloud-off-outline' }
  if (!online.value) return { text: 'Offline', color: 'warning', icon: 'mdi-wifi-off' }
  if (!signedIn.value) return { text: 'Signed out', color: 'info', icon: 'mdi-account-outline' }
  if (pending.value > 0) return { text: `${pending.value} waiting`, color: 'secondary', icon: 'mdi-cloud-upload-outline' }
  return { text: 'Synced', color: 'success', icon: 'mdi-cloud-check-outline' }
})
</script>

<template>
  <div class="settings">
    <header class="fa-hero settings-hero">
      <div class="d-flex align-center ga-3">
        <v-avatar color="white" size="48" class="hero-avatar"><v-icon color="primary" size="28">mdi-cog-outline</v-icon></v-avatar>
        <div>
          <h1 class="text-h5 font-weight-bold">Settings</h1>
          <div class="text-body-2 hero-sub">Make Foray Assist yours</div>
        </div>
      </div>
    </header>

    <v-container class="settings-body">
      <div class="settings-grid">
      <div class="settings-col settings-col-left">
      <v-card class="fa-card mb-4 fa-pop-enter-active">
        <v-card-text>
          <div class="d-flex align-center ga-3 mb-3">
            <v-avatar color="primary" variant="tonal" size="40"><v-icon>mdi-cloud-sync-outline</v-icon></v-avatar>
            <h2 class="text-subtitle-1 font-weight-bold flex-grow-1">Account &amp; sync</h2>
            <v-chip class="fa-pill flex-shrink-0" :color="status.color" variant="tonal" size="small" :prepend-icon="status.icon">
              <transition name="fa-fade" mode="out-in"><span :key="status.text">{{ status.text }}</span></transition>
            </v-chip>
          </div>

          <v-alert type="info" variant="tonal" density="compact" class="mb-3" icon="mdi-leaf">
            Foray Assist works fully without signing in. Everything is stored on this device;
            signing in only adds optional backup and sync across your devices.
          </v-alert>

          <v-alert v-if="!configured" type="warning" variant="tonal" density="compact" class="mb-3">
            Cloud sync is not configured in this build.
          </v-alert>

          <div v-else-if="signedIn" class="mb-3">
            <div>Signed in<span v-if="accountEmail"> as <strong class="break">{{ accountEmail }}</strong></span></div>
            <v-btn class="mt-2" variant="text" color="medium-emphasis" size="small" @click="signOut">Sign out</v-btn>
          </div>

          <form v-else class="mb-3" @submit.prevent="signIn">
            <v-text-field v-model="email" type="email" label="Email" autocomplete="email"
              density="comfortable" hide-details="auto" :error-messages="authError" />
            <v-btn class="mt-3" type="submit" color="primary" size="large" block :loading="sending" :disabled="!email">
              Email me a sign-in link
            </v-btn>
            <transition name="fa-fade">
              <div v-if="message" class="text-success mt-2 d-flex align-center ga-1"><v-icon size="18">mdi-email-check-outline</v-icon>{{ message }}</div>
            </transition>
          </form>

          <v-list density="compact" lines="one" bg-color="transparent" class="rounded-lg">
            <v-list-item title="Connection" :subtitle="online ? 'Online' : 'Offline'" prepend-icon="mdi-wifi" />
            <v-list-item title="Waiting to sync" :subtitle="String(pending)" prepend-icon="mdi-timer-sand" />
            <v-list-item v-if="lastError" title="Last error" :subtitle="lastError" prepend-icon="mdi-alert-circle-outline" base-color="error" />
          </v-list>

          <v-btn class="mt-2" color="primary" variant="tonal" prepend-icon="mdi-sync" :loading="syncing" :disabled="!online || !signedIn || syncing" @click="syncNow()">
            Sync now
          </v-btn>
          <div v-if="!signedIn" class="text-caption mt-1">Sign in to enable syncing.</div>
          <div v-else-if="!online" class="text-caption mt-1">Offline: changes sync when you reconnect.</div>
        </v-card-text>
      </v-card>

      <SyncIssues class="mb-4" />
      </div>

      <div class="settings-col settings-col-right">
      <section class="mb-4">
        <h2 class="section-title"><v-icon size="20" color="primary">mdi-microphone-outline</v-icon> Voice</h2>
        <VoiceModelSettings class="mb-4" />
      </section>

      <section>
        <h2 class="section-title"><v-icon size="20" color="primary">mdi-link-variant</v-icon> Connections</h2>
        <div class="conn-grid">
          <GoogleConnectCard class="mb-4" />
          <InatConnectCard class="mb-4" />
        </div>
      </section>
      </div>
      </div>
    </v-container>
  </div>
</template>

<style scoped>
.settings-hero { padding-bottom: 44px; }
.hero-sub { opacity: .9; }
.hero-avatar { animation: fa-pop .5s var(--fa-ease); }
.settings-body { max-width: 640px; margin-top: -22px; position: relative; z-index: 2; padding-left: 0; padding-right: 0; }
.section-title { display: flex; align-items: center; gap: 8px; font-size: 1.05rem; font-weight: 700; margin: 4px 4px 10px; }
.break { word-break: break-all; }

/* Desktop: two-column grid, everything visible at once. Mobile is untouched. */
@media (min-width: 960px) {
  .settings-hero {
    padding: 18px max(32px, calc((100% - 1432px) / 2)) 42px;
    border-radius: 0 0 28px 28px;
  }
  .settings-hero h1 { font-size: 1.5rem !important; }
  .settings-body.v-container { max-width: 1480px; padding: 0 32px; margin-top: 20px; }
  .settings-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 720px));
    justify-content: center;
    align-items: start;
    gap: 24px;
  }
  .settings-col { min-width: 0; display: flex; flex-direction: column; }
  .settings-col :deep(.fa-card.mb-4), .settings-col .mb-4 { margin-bottom: 20px !important; }
  .settings-col > :last-child, .settings-col > section > :last-child { margin-bottom: 0 !important; }
  .conn-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 16px;
    align-items: stretch;
  }
  .conn-grid > :deep(.fa-card) { margin-bottom: 0 !important; }
  .settings-body :deep(.fa-card) { transition: transform .25s var(--fa-ease), box-shadow .25s var(--fa-ease); }
}
@media (min-width: 1600px) {
  .settings-grid { grid-template-columns: repeat(3, minmax(0, 480px)); gap: 24px; }
  .settings-col-right { display: contents; }
  .settings-col-right > section { min-width: 0; }
  .conn-grid { grid-template-columns: 1fr; }
}
@media (min-width: 960px) and (hover: hover) {
  .settings-body :deep(.fa-card:hover) { transform: translateY(-2px); box-shadow: var(--fa-shadow-lift) !important; }
}
.fa-fade-enter-active, .fa-fade-leave-active { transition: opacity .2s var(--fa-ease), transform .2s var(--fa-ease); }
.fa-fade-enter-from, .fa-fade-leave-to { opacity: 0; transform: translateY(4px); }
</style>
