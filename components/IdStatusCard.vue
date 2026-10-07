<script setup lang="ts">
// "Your ID block": status of this device's reserved IDs, plus an integrity check of the IDs on finds.
import { liveQuery } from 'dexie'
import type { VerifyResult } from '~/composables/useVerifyIds'
import { ID_PROBLEM_HELP } from '~/composables/useVerifyIds'

const { left, pending, claiming, error, lastClaimAt, refresh, claimNow } = useIdStock()
const { online, signedIn } = useSync()

const networks = ref<string[]>([])
const setCount = ref(0)
const verifying = ref(false)
const result = ref<VerifyResult | null>(null)
const dates = ref<Record<string, string>>({})

async function load() {
  try {
    const sets = ((await useDb().settings.get('idSets'))?.value as Array<{ network: string }> | undefined) ?? []
    networks.value = [...new Set(sets.map((s) => s.network))]
    setCount.value = sets.length
    await refresh()
  } catch { /* IndexedDB unavailable */ }
}

let sub: { unsubscribe: () => void } | null = null
onMounted(() => {
  try {
    sub = liveQuery(async () => {
      const db = useDb()
      await db.settings.get('idSets')
      return db.specimens.filter((s) => !s.specimenId).count()
    }).subscribe({ next: () => load(), error: () => {} })
  } catch { load() }
})
onBeforeUnmount(() => sub?.unsubscribe())

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const fmtWhen = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const network = computed(() => (networks.value.length ? networks.value.map((n) => displayId(n)).join(', ') : ''))

const status = computed(() => {
  if (!signedIn.value) return { text: 'Sign in needed', color: 'info', icon: 'mdi-account-outline' }
  if (claiming.value) return { text: 'Getting IDs', color: 'secondary', icon: 'mdi-timer-sand' }
  if (error.value) return { text: 'Problem', color: 'error', icon: 'mdi-alert-circle-outline' }
  if (pending.value > 0) return { text: `${pending.value} waiting`, color: 'warning', icon: 'mdi-timer-sand' }
  if (left.value > 0) return { text: 'Ready', color: 'success', icon: 'mdi-check-circle-outline' }
  return { text: 'No IDs', color: 'grey', icon: 'mdi-ticket-outline' }
})

async function verify() {
  verifying.value = true
  try {
    const r = await verifyIds()
    const map: Record<string, string> = {}
    for (const p of r.problems) {
      if (!p.specimenRowId || map[p.specimenRowId]) continue
      const s = await useDb().specimens.get(p.specimenRowId)
      if (s) map[p.specimenRowId] = s.timestamp
    }
    dates.value = map
    result.value = r
  } finally { verifying.value = false }
}
const help = (code: string) => ID_PROBLEM_HELP[code] ?? { label: code.replace(/_/g, ' '), help: 'The server flagged this ID.' }
</script>

<template>
  <v-card class="fa-card id-status" data-testid="id-status">
    <v-card-text>
      <div class="d-flex align-center ga-3 mb-3">
        <v-avatar color="primary" variant="tonal" size="40"><v-icon>mdi-ticket-confirmation-outline</v-icon></v-avatar>
        <h2 class="text-subtitle-1 font-weight-bold flex-grow-1">Your ID block</h2>
        <v-chip class="fa-pill flex-shrink-0" :color="status.color" variant="tonal" size="small" :prepend-icon="status.icon">{{ status.text }}</v-chip>
      </div>

      <p v-if="!signedIn" class="text-body-2 text-medium-emphasis mb-3">
        Sign in once with a verified email, while online, to receive your personal ID block. Finds logged before then show “ID pending” and are numbered automatically afterwards.
      </p>

      <v-list density="compact" lines="one" bg-color="transparent" class="rounded-lg">
        <v-list-item title="Network" prepend-icon="mdi-lan">
          <template #subtitle><span class="id-mono">{{ network || 'Not issued yet' }}</span></template>
        </v-list-item>
        <v-list-item title="IDs left on this device" :subtitle="`${left.toLocaleString()}${setCount ? ` (${setCount} ${setCount === 1 ? 'set' : 'sets'})` : ''}`" prepend-icon="mdi-counter" />
        <v-list-item title="Finds waiting for an ID" :subtitle="String(pending)" prepend-icon="mdi-timer-sand" />
        <v-list-item title="Last claim" :subtitle="lastClaimAt ? fmtWhen(lastClaimAt) : 'Not since this app was opened'" prepend-icon="mdi-history" />
      </v-list>

      <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mt-3" data-testid="id-error">{{ error }}</v-alert>

      <div class="d-flex flex-wrap ga-2 mt-3">
        <v-btn color="primary" variant="tonal" prepend-icon="mdi-download-circle-outline" :loading="claiming"
          :disabled="!online || !signedIn || claiming" @click="claimNow()">Get more IDs now</v-btn>
        <v-btn variant="text" prepend-icon="mdi-shield-check-outline" :loading="verifying" :disabled="verifying" @click="verify">Verify IDs</v-btn>
      </div>
      <div v-if="!signedIn" class="text-caption mt-1">Sign in above to get IDs.</div>
      <div v-else-if="!online" class="text-caption mt-1">Offline: IDs you already hold keep working.</div>

      <div v-if="result" class="mt-4" aria-live="polite" data-testid="verify-result">
        <v-alert v-if="!result.problems.length" type="success" variant="tonal" density="compact">
          All {{ result.total }} {{ result.total === 1 ? 'ID looks' : 'IDs look' }} good{{ result.checkedOnline ? ', also confirmed with the cloud' : '' }}.
        </v-alert>
        <template v-else>
          <v-alert type="warning" variant="tonal" density="compact" class="mb-2">
            {{ result.problems.length }} {{ result.problems.length === 1 ? 'problem' : 'problems' }} in {{ result.total }} checked IDs.
          </v-alert>
          <ul class="problem-list">
            <li v-for="(p, i) in result.problems" :key="`${p.specimenRowId}-${p.problem}-${i}`">
              <div class="d-flex flex-wrap align-center ga-2">
                <span class="id-mono font-weight-bold">{{ displayId(p.id) }}</span>
                <v-chip size="x-small" color="warning" variant="tonal" class="fa-pill">{{ help(p.problem).label }}</v-chip>
                <span v-if="dates[p.specimenRowId]" class="text-caption text-medium-emphasis">find from {{ fmtDate(dates[p.specimenRowId]!) }}</span>
              </div>
              <div class="text-caption text-medium-emphasis">{{ help(p.problem).help }}</div>
            </li>
          </ul>
        </template>
        <div v-if="!result.checkedOnline" class="text-caption text-medium-emphasis mt-2">
          Checked on this device only. Connect and sign in to also check against the cloud.
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.id-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .04em; }
.problem-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; max-height: 320px; overflow-y: auto; }
.problem-list li { padding: 8px 10px; border-radius: 12px; background: rgba(var(--v-theme-warning), .08); }
</style>
