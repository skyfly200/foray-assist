<template>
  <v-card class="fa-card" variant="flat">
    <v-card-title class="d-flex align-center">
      <v-icon icon="mdi-account-group" color="primary" class="mr-2" /> Societies
      <v-spacer />
      <v-btn v-if="signedIn" size="small" variant="text" icon="mdi-refresh" :loading="busy" aria-label="Refresh societies" @click="run(refresh)" />
    </v-card-title>
    <v-card-text>
      <p class="text-body-2 text-medium-emphasis mb-3">
        Join a mycological society (for example FRMS or CMS) to see its forays and record its voucher numbers on your finds.
        Your own finds keep your personal IDs.
      </p>

      <div v-for="s in societies" :key="s.society_id" class="society mb-3">
        <div class="d-flex align-center">
          <div class="flex-grow-1">
            <div class="font-weight-bold">{{ s.name }}</div>
            <div class="text-caption text-medium-emphasis">{{ roleLabel(s.role) }} · numbers start {{ s.network }}</div>
          </div>
          <v-btn size="small" variant="text" @click="toggleForays(s.society_id)">{{ openForays === s.society_id ? 'Hide' : 'Forays' }}</v-btn>
        </div>
        <div v-if="s.join_code" class="text-caption mt-1">Code for new members: <b class="mono">{{ formatJoinCode(s.join_code) }}</b></div>

        <div v-if="openForays === s.society_id" class="mt-2">
          <div v-if="!sforays.length" class="text-caption text-medium-emphasis">No open society forays.</div>
          <div v-for="f in sforays" :key="f.foray_id" class="d-flex align-center py-1">
            <div class="flex-grow-1">{{ f.name }} <span class="text-caption text-medium-emphasis">{{ new Date(f.started_at).toLocaleDateString() }}</span></div>
            <v-btn size="small" color="primary" variant="tonal" :loading="busy" @click="joinSocietyForay(f.join_code)">Join</v-btn>
          </div>
        </div>

        <div v-if="s.role !== 'member'" class="mt-2">
          <v-btn size="small" variant="tonal" prepend-icon="mdi-numeric" :loading="busy" @click="claim(s.society_id)">Get voucher numbers (1,024)</v-btn>
          <div v-for="r in setsFor(s.society_id)" :key="r.first" class="text-caption mt-1">
            Sheet range <b class="mono">{{ displayId(r.first) }}</b> to <b class="mono">{{ displayId(r.last) }}</b>
          </div>
        </div>
      </div>

      <div v-if="signedIn" class="d-flex ga-2 align-start">
        <v-text-field v-model="code" label="Society code" placeholder="ABCD-EFGH" density="comfortable" variant="outlined" hide-details="auto" />
        <v-btn color="primary" :loading="busy" :disabled="!code.trim()" class="mt-1" @click="onJoin">Join</v-btn>
      </div>
      <div v-else class="text-caption text-medium-emphasis">Sign in to join a society.</div>
      <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mt-3">{{ error }}</v-alert>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { displayId } from '~/utils/idCode'
import { formatJoinCode } from '~/utils/sharing'
import { getDisplayName, joinForay } from '~/composables/useSharedForay'
import type { SocietySet } from '~/composables/useSocieties'

const { signedIn } = useSync()
const { societies, refresh, join, forays, claimVoucherSets, claimedSets, setRange } = useSocieties()
const router = useRouter()
const code = ref('')
const busy = ref(false)
const error = ref('')
const openForays = ref('')
const sforays = ref<Awaited<ReturnType<typeof forays>>>([])
const sets = ref<SocietySet[]>([])

const roleLabel = (r: string) => ({ officer: 'Officer', leader: 'Foray leader', member: 'Member' } as Record<string, string>)[r] ?? r
const setsFor = (id: string) => sets.value.filter((s) => s.societyId === id).map(setRange)

async function run(fn: () => Promise<unknown>) {
  busy.value = true
  error.value = ''
  try { await fn() } catch (e: any) { error.value = e?.message ?? String(e) } finally { busy.value = false }
}

onMounted(async () => {
  sets.value = await claimedSets()
  if (signedIn.value && navigator.onLine) void run(refresh)
})
watch(signedIn, (v) => { if (v) void run(refresh) })

const onJoin = () => run(async () => {
  await join(code.value, await getDisplayName())
  code.value = ''
})
const toggleForays = (id: string) => run(async () => {
  if (openForays.value === id) { openForays.value = ''; return }
  sforays.value = await forays(id)
  openForays.value = id
})
const joinSocietyForay = (c: string) => run(async () => {
  const id = await joinForay(c, await getDisplayName())
  router.push(`/forays/${id}`)
})
const claim = (id: string) => run(async () => {
  await claimVoucherSets(id, 1)
  sets.value = await claimedSets()
})
</script>

<style scoped>
.society { padding: 10px 12px; border-radius: var(--fa-radius-sm); background: rgba(var(--v-theme-primary), 0.06); }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
</style>
