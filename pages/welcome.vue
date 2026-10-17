<script setup lang="ts">
// Shown once, after someone's first sign-in (see composables/useAuthFlow.ts).
import { getDisplayName, setDisplayName } from '~/composables/useSharedForay'

let sb: any = null
try { sb = useSupabaseClient() } catch { /* not configured */ }
const { left } = useIdStock()
const { signedIn } = useSync()
const name = ref('')
const busy = ref(false)
const hasNext = ref(false)

onMounted(async () => {
  hasNext.value = !!storedReturn()
  let email = ''
  try { email = (await sb?.auth.getSession())?.data?.session?.user?.email ?? '' } catch { /* ignore */ }
  try { name.value = await getDisplayName(email) } catch { /* ignore */ }
})

async function go() {
  busy.value = true
  try { if (name.value.trim()) await setDisplayName(name.value) } catch { /* keep going */ }
  await finishWelcome(sb)
  busy.value = false
}

const points = [
  { icon: 'mdi-map-marker-path', title: 'Start a foray', text: 'One per outing. Photos, voice notes and GPS go on each find.' },
  { icon: 'mdi-wifi-off', title: 'Works offline', text: 'Everything saves on this device first. No signal in the woods is fine.' },
  { icon: 'mdi-ticket-confirmation-outline', title: 'Your own specimen IDs', text: 'Your ID block is being reserved now, so finds get numbered offline too.' },
  { icon: 'mdi-cloud-sync-outline', title: 'Backed up', text: 'Finds sync to your account when you’re online, across your devices.' },
]
</script>

<template>
  <div class="fa-welcome">
    <header class="fa-hero fa-welcome__hero fa-pop-enter-active">
      <v-avatar color="white" size="56" class="mb-3"><v-icon color="primary" size="32">mdi-mushroom</v-icon></v-avatar>
      <h1 class="text-h5 font-weight-bold">Welcome to Voucher</h1>
      <p class="fa-welcome__sub">You’re signed in. Here’s the short version.</p>
    </header>

    <v-card class="fa-card fa-welcome__card" flat>
      <v-card-text class="pa-5">
        <ul class="fa-welcome__points">
          <li v-for="p in points" :key="p.title">
            <v-avatar color="primary" variant="tonal" size="40"><v-icon>{{ p.icon }}</v-icon></v-avatar>
            <div>
              <div class="font-weight-bold">{{ p.title }}</div>
              <div class="text-body-2 text-medium-emphasis">{{ p.text }}</div>
            </div>
          </li>
        </ul>
        <div v-if="signedIn && left > 0" class="text-caption text-success mb-3">
          <v-icon size="16">mdi-check-circle</v-icon> {{ left.toLocaleString() }} IDs ready
        </div>

        <form @submit.prevent="go">
          <v-text-field v-model="name" label="Your name, for shared forays" maxlength="60" density="comfortable"
            hide-details autocomplete="nickname" class="mb-4" />
          <v-btn type="submit" color="primary" size="large" block :loading="busy">
            {{ hasNext ? 'Continue' : 'Let’s go' }}
          </v-btn>
        </form>
        <div class="text-caption text-medium-emphasis mt-3 text-center">
          Voice, field form and connections are in Settings whenever you want them.
        </div>
      </v-card-text>
    </v-card>
  </div>
</template>

<style scoped>
.fa-welcome { max-width: 560px; margin: 0 auto; }
.fa-welcome__hero { text-align: center; padding-bottom: 48px; }
.fa-welcome__sub { opacity: 0.9; margin: 4px 0 0; }
.fa-welcome__card { margin: -28px 12px 24px; position: relative; z-index: 2; }
.fa-welcome__points { list-style: none; padding: 0; margin: 0 0 16px; display: grid; gap: 16px; }
.fa-welcome__points li { display: flex; gap: 14px; align-items: flex-start; }
</style>
