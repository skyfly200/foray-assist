<template>
  <v-card class="fa-card nearby" variant="flat">
    <v-card-text>
      <div class="d-flex align-center">
        <v-icon :icon="nearby.active.value ? 'mdi-access-point' : 'mdi-access-point-off'" :color="nearby.running.value ? 'primary' : undefined" class="mr-2" />
        <div class="flex-grow-1">
          <div class="font-weight-bold">Nearby alerts</div>
          <div class="text-caption text-medium-emphasis">{{ statusLine }}</div>
        </div>
        <v-switch
          :model-value="nearby.enabled.value"
          color="primary"
          hide-details
          inset
          density="compact"
          aria-label="Nearby alerts"
          :disabled="!foray?.shared?.meshKey || !!foray?.endedAt"
          @update:model-value="(v: boolean | null) => nearby.toggle(!!v)"
        />
      </div>
      <div v-if="nearby.running.value" class="summary mt-3">
        <div class="big">{{ nearby.summary.value.near }}</div>
        <div>find{{ nearby.summary.value.near === 1 ? '' : 's' }} within {{ nearby.summary.value.radiusM }} m of you<br />
          <span class="text-caption text-medium-emphasis">{{ nearby.summary.value.recent }} heard in the last 2 hours · {{ nearby.received.value }} synced from nearby</span>
        </div>
      </div>
      <v-list v-if="nearby.running.value && recentAlerts.length" density="compact" class="mt-2 bg-transparent">
        <v-list-item v-for="a in recentAlerts" :key="a.key" :title="a.species || 'Unnamed find'" :subtitle="alertLine(a)" prepend-icon="mdi-mushroom-outline" />
      </v-list>
      <v-alert v-if="nearby.error.value" type="warning" variant="tonal" density="compact" class="mt-2">{{ nearby.error.value }}</v-alert>
      <div class="text-caption text-medium-emphasis mt-2">
        Shares new finds with members of this foray who are close by, encrypted and signed, with no signal needed.
        Private finds and sensitive species are never announced. Phone-to-phone Bluetooth arrives with the Android app;
        for now this links other windows of the app on this device.
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import type { Foray, NearbyAlert } from '~/utils/db'
import { displayId } from '~/utils/idCode'
import { useNearby } from '~/composables/useNearby'

const props = defineProps<{ forayId: string; foray: Foray | null | undefined }>()
const forayRef = computed(() => props.foray)
const nearby = useNearby(props.forayId, forayRef)

const statusLine = computed(() => {
  if (!props.foray?.shared?.meshKey) return 'Available once this foray is shared'
  if (props.foray?.endedAt) return 'This foray has ended'
  if (!nearby.enabled.value) return 'Off'
  if (!nearby.running.value) return 'Starting…'
  return nearby.active.value ? `Listening (${nearby.transportName.value})` : 'Resting to save battery'
})

const recentAlerts = computed(() => [...nearby.alerts.value].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5))
function alertLine(a: NearbyAlert) {
  const who = a.authorName ? `${a.authorName} · ` : ''
  const t = new Date(a.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return `${who}${displayId(a.specimenId)} · ${t}${a.precisionM && a.precisionM > 1000 ? ' · rough area' : ''}`
}
</script>

<style scoped>
.summary { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: var(--fa-radius-sm); background: rgba(var(--v-theme-primary), 0.08); }
.big { font-size: 2rem; font-weight: 800; color: rgb(var(--v-theme-primary)); line-height: 1; }
</style>
