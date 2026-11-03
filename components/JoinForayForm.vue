<template>
  <v-card class="fa-card" title="Join a shared foray">
    <v-card-text>
      <p class="mb-4 text-medium-emphasis">
        Scan the QR code on the other person's phone, type their code, or open their link. With no signal, scan
        their QR code: you can start logging finds in the foray straight away, and the app finishes joining once
        you're back online.
      </p>
      <QrScanDialog @scanned="onScanned">
        <template #activator="{ props: act }">
          <v-btn v-bind="act" block color="primary" variant="tonal" rounded="xl" size="large" prepend-icon="mdi-qrcode-scan" class="mb-4" data-testid="scan-qr">
            Scan QR code
          </v-btn>
        </template>
      </QrScanDialog>
      <v-text-field
        v-model="code"
        label="Join code"
        placeholder="ABCD-EFGH"
        variant="outlined"
        autocapitalize="characters"
        autocomplete="off"
        spellcheck="false"
        class="code-input"
        :error-messages="codeHint"
        data-testid="join-code-input"
      />
      <v-text-field v-model="name" label="Your name, as members see it" variant="outlined" density="comfortable" maxlength="60" />
      <v-alert v-if="!online" type="info" variant="tonal" density="compact" class="mb-2" data-testid="join-offline">
        <template v-if="offlineForay">
          You're offline. You can add finds to <b>{{ offlineForay.name || 'this foray' }}</b> now; joining finishes when you have signal{{ signedIn ? '' : ' and are signed in' }}.
        </template>
        <template v-else>
          You're offline. Scan their QR code to start using the foray now, or save a typed code and the app joins when you have signal{{ signedIn ? '' : ' and are signed in' }}.
        </template>
      </v-alert>
      <v-alert v-else-if="!signedIn" type="info" variant="tonal" density="compact" class="mb-2">
        <NuxtLink :to="{ path: '/settings', query: { next: route.fullPath } }">Sign in</NuxtLink> to join, or save the code now and it joins after you sign in.
      </v-alert>
      <v-alert v-if="error" type="error" variant="tonal" density="compact">{{ error }}</v-alert>
    </v-card-text>
    <v-card-actions>
      <v-spacer />
      <v-btn @click="emit('cancel')">Cancel</v-btn>
      <v-btn color="primary" variant="flat" rounded="xl" :loading="busy" :disabled="!parsed || !name.trim()" @click="onJoin">{{ online && signedIn ? 'Join' : offlineForay ? 'Join offline' : 'Join later' }}</v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
import { formatJoinCode, parseJoinInput, parseJoinLink, type JoinLinkForay } from '~/utils/sharing'
import { getDisplayName, joinForay, joinOffline, queueJoin } from '~/composables/useSharedForay'

const props = defineProps<{ initialCode?: string; initialForay?: JoinLinkForay }>()
const emit = defineEmits<{ joined: [id: string]; queued: [code: string]; cancel: [] }>()
const { online, signedIn } = useSync()
const route = useRoute()
const code = ref(props.initialCode ?? '')
const name = ref('')
const busy = ref(false)
const error = ref('')
const parsed = computed(() => parseJoinInput(code.value))
// Foray details from a scanned QR or opened link; dropped if the code is then edited to a different one.
const linkForay = ref<(JoinLinkForay & { code: string }) | null>(props.initialForay && props.initialCode ? { ...props.initialForay, code: parseJoinInput(props.initialCode) ?? '' } : null)
const offlineForay = computed(() => (linkForay.value && linkForay.value.code === parsed.value ? linkForay.value : null))
const codeHint = computed(() => (code.value.trim() && !parsed.value ? 'A code is 8 letters and numbers (no I, O, 0 or 1).' : ''))

onMounted(async () => {
  let email = ''
  try { email = (await useSupabaseClient().auth.getSession()).data.session?.user?.email ?? '' } catch { /* not configured */ }
  name.value = await getDisplayName(email)
})

function onScanned(link: NonNullable<ReturnType<typeof parseJoinLink>>) {
  code.value = formatJoinCode(link.code)
  linkForay.value = link.forayId ? { ...link, forayId: link.forayId } : null
  if (name.value.trim()) void onJoin()
}

async function onJoin() {
  if (!parsed.value) return
  busy.value = true
  error.value = ''
  try {
    if (!online.value || !signedIn.value) {
      if (offlineForay.value) {
        emit('joined', await joinOffline(parsed.value, name.value.trim(), offlineForay.value))
        return
      }
      await queueJoin(parsed.value, name.value.trim())
      emit('queued', parsed.value)
      return
    }
    emit('joined', await joinForay(parsed.value, name.value.trim()))
  } catch (e: any) {
    error.value = e?.message ?? String(e)
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.code-input :deep(input) { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.1em; font-size: 1.2rem; text-transform: uppercase; }
</style>
