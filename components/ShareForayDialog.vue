<template>
  <v-dialog v-model="open" max-width="520" scrollable>
    <template #activator="{ props: act }">
      <slot name="activator" :props="act">
        <v-btn v-bind="act" variant="tonal" rounded="xl" :prepend-icon="isShared ? 'mdi-account-group' : 'mdi-share-variant'">
          {{ isShared ? `Shared · ${activeMembers.length}` : 'Share' }}
        </v-btn>
      </slot>
    </template>

    <v-card class="fa-card" :title="isShared ? 'Shared foray' : 'Share this foray'">
      <v-card-text>
        <!-- Not shared yet: owner turns it on. -->
        <template v-if="!isShared">
          <p class="mb-3">
            People join with a code or by scanning a QR code. Everyone's finds then show up together here.
            Each person's finds keep their own IDs, and nobody can change anyone else's finds.
          </p>
          <p class="text-caption text-medium-emphasis mb-4">
            Locations follow each find's privacy setting: open finds show exactly, obscured ones as a rough area
            (about 20 km), and private ones not at all.
          </p>
          <v-text-field v-model="name" label="Your name, as members see it" variant="outlined" density="comfortable" maxlength="60" />
          <v-select
            v-if="leadSocieties.length"
            v-model="societyId"
            :items="[{ title: 'Just me (not a society foray)', value: '' }, ...leadSocieties.map((s) => ({ title: s.name, value: s.society_id }))]"
            label="Run it for a society?"
            variant="outlined"
            density="comfortable"
          />
          <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-3">{{ error }}</v-alert>
          <v-btn color="primary" block size="large" rounded="xl" :loading="busy" prepend-icon="mdi-share-variant" @click="onShare">
            Share this foray
          </v-btn>
        </template>

        <!-- Shared: code, QR, members. -->
        <template v-else>
          <div v-if="foray?.shared?.societyName" class="text-caption mb-2">
            <v-icon icon="mdi-account-group" size="16" /> {{ foray.shared.societyName }} foray
          </div>
          <div v-if="code" class="code-block">
            <div class="text-overline">Join code</div>
            <div class="code" data-testid="join-code">{{ formatJoinCode(code) }}</div>
            <img v-if="qr" :src="qr" alt="QR code to join this foray" class="qr" />
            <div class="d-flex flex-wrap ga-2 justify-center mt-2">
              <v-btn variant="tonal" size="small" prepend-icon="mdi-content-copy" @click="copyLink">{{ copied ? 'Copied' : 'Copy link' }}</v-btn>
              <v-btn v-if="canShareLink" variant="tonal" size="small" prepend-icon="mdi-share" @click="shareLink">Send link</v-btn>
            </div>
          </div>
          <v-alert v-else type="info" variant="tonal" density="compact" class="mb-3">
            Joining is turned off. Members who already joined still see everything.
          </v-alert>

          <div class="d-flex align-center mt-4 mb-1">
            <div class="text-subtitle-2">Members</div>
            <v-spacer />
            <v-btn size="small" variant="text" icon="mdi-refresh" :loading="busy" aria-label="Refresh members" @click="onRefresh" />
          </div>
          <v-list density="compact" class="members">
            <v-list-item v-for="m in activeMembers" :key="m.userId" :title="m.displayName" :subtitle="roleLabel(m.role)">
              <template #prepend><v-avatar size="32" color="primary" variant="tonal">{{ initials(m.displayName) }}</v-avatar></template>
              <template v-if="isOwner && m.role !== 'owner'" #append>
                <v-btn size="small" variant="text" @click="toggleLeader(m.userId, m.role)">{{ m.role === 'leader' ? 'Make member' : 'Make leader' }}</v-btn>
              </template>
            </v-list-item>
            <v-list-item v-if="!activeMembers.length" title="Members show up after the next refresh" />
          </v-list>
          <div v-if="formerCount" class="text-caption text-medium-emphasis">{{ formerCount }} former member{{ formerCount === 1 ? '' : 's' }}; their finds stay in the foray.</div>

          <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mt-3">{{ error }}</v-alert>
        </template>
      </v-card-text>

      <v-card-actions v-if="isShared" class="flex-wrap">
        <template v-if="canManage">
          <v-btn variant="text" :loading="busy" @click="onRotate(false)">New code</v-btn>
          <v-btn v-if="code" variant="text" :loading="busy" @click="onRotate(true)">Turn joining off</v-btn>
        </template>
        <v-btn v-if="!isOwner" color="error" variant="text" :loading="busy" @click="onLeave">Leave foray</v-btn>
        <v-spacer />
        <v-btn @click="open = false">Done</v-btn>
      </v-card-actions>
      <v-card-actions v-else>
        <v-spacer />
        <v-btn @click="open = false">Cancel</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import type { Foray } from '~/utils/db'
import { formatJoinCode, joinUrl } from '~/utils/sharing'
import {
  getDisplayName, leaveForay, refreshForay, rotateJoinCode, setMemberRole, shareForay, shareSocietyForay,
} from '~/composables/useSharedForay'

const props = defineProps<{ foray: Foray | null | undefined }>()
const open = ref(false)
const busy = ref(false)
const error = ref('')
const name = ref('')
const societyId = ref('')
const qr = ref('')
const copied = ref(false)
const { societies } = useSocieties()
const leadSocieties = computed(() => societies.value.filter((s) => s.role === 'officer' || s.role === 'leader'))

const isShared = computed(() => !!props.foray?.shared)
const isOwner = computed(() => props.foray?.shared?.role === 'owner')
const canManage = computed(() => isOwner.value || props.foray?.shared?.role === 'leader')
const code = computed(() => props.foray?.shared?.joinCode ?? '')
const activeMembers = computed(() => (props.foray?.shared?.members ?? []).filter((m) => !m.leftAt))
const formerCount = computed(() => (props.foray?.shared?.members ?? []).filter((m) => m.leftAt).length)
const link = computed(() => (code.value && import.meta.client ? joinUrl(window.location.origin, code.value) : ''))
const canShareLink = computed(() => import.meta.client && typeof (navigator as any).share === 'function')

const roleLabel = (r: string) => ({ owner: 'Started this foray', leader: 'Leader', member: 'Member' } as Record<string, string>)[r] ?? r
const initials = (n: string) => n.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?'

watch(open, async (v) => {
  if (!v) return
  error.value = ''
  if (!name.value) {
    let email = ''
    try { email = (await useSupabaseClient().auth.getSession()).data.session?.user?.email ?? '' } catch { /* not configured */ }
    name.value = await getDisplayName(email)
  }
  // Quiet refresh: the cached member list is fine offline, so no error here.
  if (isShared.value) void refreshForay(props.foray!.id).catch(() => {})
})

watch(link, async (url) => {
  qr.value = ''
  if (!url) return
  const QR: any = (await import('qrcode')).default ?? (await import('qrcode'))
  qr.value = await QR.toDataURL(url, { margin: 1, width: 240, errorCorrectionLevel: 'M' })
}, { immediate: true })

async function run(fn: () => Promise<unknown>) {
  busy.value = true
  error.value = ''
  try { await fn() } catch (e: any) { error.value = e?.message ?? String(e) } finally { busy.value = false }
}

const onShare = () => run(async () => {
  if (!props.foray) return
  if (!name.value.trim()) throw new Error('Add the name members will see.')
  if (societyId.value) await shareSocietyForay(props.foray, name.value.trim(), societyId.value)
  else await shareForay(props.foray, name.value.trim())
})
const onRefresh = () => run(() => refreshForay(props.foray!.id))
const onRotate = (disable: boolean) => run(() => rotateJoinCode(props.foray!.id, disable))
const toggleLeader = (userId: string, role: string) => run(() => setMemberRole(props.foray!.id, userId, role === 'leader' ? 'member' : 'leader'))
const onLeave = () => run(async () => {
  await leaveForay(props.foray!.id)
  open.value = false
})

async function copyLink() {
  try {
    await navigator.clipboard.writeText(link.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch { error.value = 'Could not copy. Long-press the code instead.' }
}
async function shareLink() {
  try { await (navigator as any).share({ title: props.foray?.name, text: `Join my foray in Foray Assist: code ${formatJoinCode(code.value)}`, url: link.value }) } catch { /* cancelled */ }
}
</script>

<style scoped>
.code-block { text-align: center; padding: 12px; border-radius: var(--fa-radius-sm); background: rgba(var(--v-theme-primary), 0.06); }
.code { font-size: 2rem; font-weight: 800; letter-spacing: 0.12em; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: rgb(var(--v-theme-primary)); }
.qr { width: 200px; height: 200px; image-rendering: pixelated; margin-top: 8px; background: #fff; border-radius: 12px; padding: 6px; }
.members { background: transparent; }
</style>
