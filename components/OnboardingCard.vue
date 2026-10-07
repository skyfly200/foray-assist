<script setup lang="ts">
// Home-page card that steers the user to sign in ONCE (verified email) so the server can issue
// their ID block. Everything else works offline without it.
import { liveQuery } from 'dexie'

const { signedIn, online } = useSync()
const { left, pending, claiming, error, refresh, ensureStock } = useIdStock()

let sb: any = null
const configured = (() => {
  try {
    const cfg: any = useRuntimeConfig().public
    if (!cfg?.syncConfigured || !cfg?.supabase?.url || !cfg?.supabase?.key) return false
    sb = useSupabaseClient()
    return true
  } catch { return false }
})()

const DISMISS_KEY = 'onboardingDismissed'
const dismissed = ref(false)
const ready = ref(false) // dismissal loaded
const email = ref('')
const code = ref('')
const codeSent = ref(false)
const busy = ref(false)
const err = ref('')
const showDone = ref(false)
const wasWorking = ref(false)
let doneTimer: ReturnType<typeof setTimeout> | undefined
let sub: { unsubscribe: () => void } | null = null

onMounted(async () => {
  try { dismissed.value = !!(await useDb().settings.get(DISMISS_KEY))?.value } catch { /* ignore */ }
  ready.value = true
  refresh()
  try {
    const db = useDb()
    sub = liveQuery(async () => {
      await db.settings.get('idSets')
      return db.specimens.filter((s) => !s.specimenId).count()
    }).subscribe({ next: () => refresh(), error: () => {} })
  } catch { /* ignore */ }
  if (signedIn.value && online.value) ensureStock()
})
onBeforeUnmount(() => { sub?.unsubscribe(); clearTimeout(doneTimer) })

// Signing in (or coming back online while signed in) triggers the claim.
watch([signedIn, online], ([s, o]) => { if (s && o) ensureStock() })

// Detect "was getting IDs, now has them" to show the brief celebration.
const working = computed(() => signedIn.value && (claiming.value || (pending.value > 0 && left.value === 0)))
watch(working, (w) => { if (w) wasWorking.value = true })
watch([working, left, pending], () => {
  if (wasWorking.value && signedIn.value && !working.value && left.value > 0 && pending.value === 0) {
    wasWorking.value = false
    showDone.value = true
    clearTimeout(doneTimer)
    doneTimer = setTimeout(() => (showDone.value = false), 6000)
  }
})

const mode = computed<'none' | 'unconfigured' | 'signin' | 'claiming' | 'done'>(() => {
  if (!ready.value) return 'none'
  if (showDone.value && signedIn.value) return 'done'
  if (!configured) return pending.value > 0 && !dismissed.value ? 'unconfigured' : 'none'
  if (!signedIn.value) return dismissed.value ? 'none' : 'signin'
  if (claiming.value || pending.value > 0) return 'claiming'
  return 'none'
})
const showChip = computed(() => ready.value && !signedIn.value && dismissed.value && pending.value > 0)

async function dismiss() {
  dismissed.value = true
  try { await useDb().settings.put({ key: DISMISS_KEY, value: true }) } catch { /* ignore */ }
}
async function undismiss() {
  dismissed.value = false
  try { await useDb().settings.put({ key: DISMISS_KEY, value: false }) } catch { /* ignore */ }
}

async function sendCode() {
  err.value = ''
  if (!configured || !email.value.trim()) return
  busy.value = true
  try {
    const { error: e } = await sb.auth.signInWithOtp({
      email: email.value.trim(),
      options: { shouldCreateUser: true, emailRedirectTo: window.location.origin + '/settings' },
    })
    if (e) err.value = e.message
    else codeSent.value = true
  } catch (e: any) {
    err.value = e?.message ?? 'Could not send the email'
  } finally { busy.value = false }
}

async function verify() {
  err.value = ''
  if (!configured || !/^\d{6}$/.test(code.value.trim())) { err.value = 'Enter the 6-digit code from the email.'; return }
  busy.value = true
  try {
    const { error: e } = await sb.auth.verifyOtp({ email: email.value.trim(), token: code.value.trim(), type: 'email' })
    if (e) err.value = e.message
    else { code.value = ''; codeSent.value = false }
  } catch (e: any) {
    err.value = e?.message ?? 'Verification failed'
  } finally { busy.value = false }
}
const onCodeInput = (v: string) => { code.value = v.replace(/\D/g, '').slice(0, 6) }
</script>

<template>
  <div class="fa-onb-wrap">
    <transition name="fa-onb" mode="out-in">
      <v-card v-if="mode !== 'none'" :key="mode" class="fa-card fa-onb" :class="`fa-onb--${mode}`" flat data-testid="onboarding-card">
        <v-card-text class="fa-onb__body">
          <div class="fa-onb__head">
            <v-avatar class="fa-onb__avatar" :color="mode === 'done' ? 'success' : 'primary'" variant="tonal" size="44">
              <v-icon v-if="mode === 'claiming'" class="fa-onb__spin">mdi-timer-sand</v-icon>
              <v-icon v-else-if="mode === 'done'">mdi-party-popper</v-icon>
              <v-icon v-else-if="mode === 'unconfigured'">mdi-cloud-off-outline</v-icon>
              <v-icon v-else>mdi-ticket-confirmation-outline</v-icon>
            </v-avatar>
            <div class="fa-onb__title">
              <template v-if="mode === 'signin'">Get your personal ID block</template>
              <template v-else-if="mode === 'unconfigured'">Cloud isn't set up in this build</template>
              <template v-else-if="mode === 'claiming'">Getting your IDs…</template>
              <template v-else>You're set</template>
            </div>
          </div>

          <!-- (a) not configured -->
          <p v-if="mode === 'unconfigured'" class="fa-onb__text">
            This build has no cloud connection, so your finds will show “ID pending”. Everything else keeps working on this device.
          </p>

          <!-- (b) sign in -->
          <template v-else-if="mode === 'signin'">
            <p class="fa-onb__text">
              Sign in once, with internet, to get your personal ID block. Then everything works offline.
            </p>
            <form v-if="!codeSent" class="fa-onb__form" @submit.prevent="sendCode">
              <v-text-field v-model="email" type="email" label="Email" autocomplete="email" density="comfortable"
                hide-details="auto" :error-messages="err" :disabled="!online" />
              <v-btn type="submit" color="primary" size="large" :loading="busy" :disabled="!email || !online">Send me a code</v-btn>
            </form>
            <form v-else class="fa-onb__form" @submit.prevent="verify">
              <p class="fa-onb__text mb-0">
                We emailed <strong class="fa-onb__break">{{ email }}</strong>. Enter the 6-digit code, or tap the link in the email.
              </p>
              <v-text-field :model-value="code" label="6-digit code" inputmode="numeric" autocomplete="one-time-code"
                maxlength="6" density="comfortable" hide-details="auto" :error-messages="err" @update:model-value="onCodeInput" />
              <v-btn type="submit" color="primary" size="large" :loading="busy" :disabled="code.length !== 6">Verify</v-btn>
              <v-btn variant="text" size="small" :disabled="busy" @click="codeSent = false; code = ''; err = ''">Use a different email</v-btn>
            </form>
            <div v-if="!online" class="fa-onb__hint">You're offline. Sign-in needs internet, just once.</div>
            <div class="fa-onb__foot">
              <a href="#" class="fa-onb__link" @click.prevent="dismiss">Not now</a>
              <span class="fa-onb__hint">Finds show “ID pending” until you do.</span>
            </div>
          </template>

          <!-- (c) claiming -->
          <template v-else-if="mode === 'claiming'">
            <p class="fa-onb__text" aria-live="polite">
              <template v-if="error">Couldn't get IDs yet: {{ error }}</template>
              <template v-else-if="!online">Waiting for a connection. {{ pending }} {{ pending === 1 ? 'find is' : 'finds are' }} waiting for an ID.</template>
              <template v-else>Reserving IDs for this device<span v-if="pending">; {{ pending }} {{ pending === 1 ? 'find' : 'finds' }} will be numbered right after</span>.</template>
            </p>
            <v-progress-linear v-if="claiming" indeterminate rounded color="primary" height="6" aria-label="Getting your IDs" />
            <div class="fa-onb__hint mt-2">{{ left.toLocaleString() }} IDs ready so far</div>
            <v-btn v-if="error && online && !claiming" class="mt-2" color="primary" variant="tonal" @click="ensureStock()">Try again</v-btn>
          </template>

          <!-- (d) done -->
          <p v-else class="fa-onb__text" aria-live="polite">
            You're set: {{ left.toLocaleString() }} IDs ready for offline use.
          </p>
        </v-card-text>
      </v-card>
      <button v-else-if="showChip" key="chip" type="button" class="fa-onb__chip" @click="undismiss">
        <v-icon size="16" icon="mdi-timer-sand" />{{ pending }} {{ pending === 1 ? 'find' : 'finds' }} waiting for an ID
      </button>
    </transition>
  </div>
</template>

<style scoped>
.fa-onb-wrap { margin: 16px 0 0; }
.fa-onb { border: 1px solid rgba(var(--v-theme-primary), 0.25); background: rgba(var(--v-theme-primary), 0.06) !important; overflow: hidden; }
.fa-onb--done { border-color: rgba(var(--v-theme-success), 0.4); background: rgba(var(--v-theme-success), 0.08) !important; }
.fa-onb__body { padding: 16px; }
.fa-onb__head { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.fa-onb__title { font-weight: 800; font-size: 1.05rem; line-height: 1.25; }
.fa-onb__text { margin: 0 0 12px; font-size: 0.92rem; opacity: 0.85; }
.fa-onb__form { display: grid; gap: 10px; max-width: 420px; }
.fa-onb__break { word-break: break-all; }
.fa-onb__foot { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; margin-top: 12px; }
.fa-onb__link { color: rgb(var(--v-theme-primary)); font-weight: 600; text-decoration: underline; padding: 6px 0; }
.fa-onb__hint { font-size: 0.78rem; opacity: 0.7; }
.fa-onb__spin { animation: fa-onb-spin 2.4s linear infinite; }
@keyframes fa-onb-spin { to { transform: rotate(360deg); } }
.fa-onb__chip {
  display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 999px; min-height: 36px;
  font-size: 0.8rem; font-weight: 600; cursor: pointer; border: 1px solid rgba(var(--v-theme-warning), 0.5);
  background: rgba(var(--v-theme-warning), 0.14); color: rgb(var(--v-theme-on-background));
}
.fa-onb-enter-active, .fa-onb-leave-active { transition: opacity 0.25s var(--fa-ease), transform 0.25s var(--fa-ease); }
.fa-onb-enter-from, .fa-onb-leave-to { opacity: 0; transform: translateY(-6px); }

@media (min-width: 960px) {
  .fa-onb-wrap { margin-top: 24px; }
  .fa-onb__body { padding: 20px 24px; }
  .fa-onb__form { grid-template-columns: minmax(0, 1fr) auto; align-items: start; max-width: 640px; }
  .fa-onb__form > :not(.v-input):not(.v-btn) { grid-column: 1 / -1; }
  .fa-onb__form > .v-btn[variant='text'] { grid-column: 1 / -1; justify-self: start; }
  .fa-onb__form > .v-btn { height: 48px !important; }
}
@media (prefers-reduced-motion: reduce) { .fa-onb__spin { animation: none; } }
</style>
