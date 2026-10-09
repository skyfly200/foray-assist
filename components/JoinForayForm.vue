<template>
  <v-card class="fa-card" title="Join a shared foray">
    <v-card-text>
      <p class="mb-4 text-medium-emphasis">
        Enter the code from the person who shared it, or open their link. You need a connection and to be signed in
        to join; after that the foray works offline like your own.
      </p>
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
      <v-alert v-if="!signedIn" type="info" variant="tonal" density="compact" class="mb-2">
        <NuxtLink to="/settings">Sign in on the Settings page</NuxtLink> first.
      </v-alert>
      <v-alert v-if="error" type="error" variant="tonal" density="compact">{{ error }}</v-alert>
    </v-card-text>
    <v-card-actions>
      <v-spacer />
      <v-btn @click="emit('cancel')">Cancel</v-btn>
      <v-btn color="primary" variant="flat" rounded="xl" :loading="busy" :disabled="!parsed || !name.trim()" @click="onJoin">Join</v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
import { parseJoinInput } from '~/utils/sharing'
import { getDisplayName, joinForay } from '~/composables/useSharedForay'

const props = defineProps<{ initialCode?: string }>()
const emit = defineEmits<{ joined: [id: string]; cancel: [] }>()
const { signedIn } = useSync()
const code = ref(props.initialCode ?? '')
const name = ref('')
const busy = ref(false)
const error = ref('')
const parsed = computed(() => parseJoinInput(code.value))
const codeHint = computed(() => (code.value.trim() && !parsed.value ? 'A code is 8 letters and numbers (no I, O, 0 or 1).' : ''))

onMounted(async () => {
  let email = ''
  try { email = (await useSupabaseClient().auth.getSession()).data.session?.user?.email ?? '' } catch { /* not configured */ }
  name.value = await getDisplayName(email)
})

async function onJoin() {
  if (!parsed.value) return
  busy.value = true
  error.value = ''
  try {
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
