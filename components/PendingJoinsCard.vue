<template>
  <v-card v-if="pending.length" class="fa-card mb-4" data-testid="pending-joins">
    <v-card-item prepend-icon="mdi-account-clock" title="Waiting to join" :subtitle="subtitle" />
    <v-list density="compact" class="bg-transparent">
      <v-list-item v-for="p in pending" :key="p.code" :title="formatJoinCode(p.code)" :subtitle="p.error || `As ${p.displayName}`">
        <template #append>
          <v-btn v-if="p.error" size="small" variant="text" @click="retry(p)">Try again</v-btn>
          <v-btn size="small" variant="text" icon="mdi-close" :aria-label="`Forget ${formatJoinCode(p.code)}`" @click="dropPendingJoin(p.code)" />
        </template>
      </v-list-item>
    </v-list>
  </v-card>
</template>

<script setup lang="ts">
// Joins saved offline (e.g. a QR scanned at the trailhead). The sync plugin finishes them.
import { formatJoinCode, type PendingJoin } from '~/utils/sharing'
import { dropPendingJoin, flushPendingJoins, queueJoin, usePendingJoins } from '~/composables/useSharedForay'

const pending = usePendingJoins()
const { online, signedIn } = useSync()
const subtitle = computed(() => (!online.value ? 'Joins when you have signal' : !signedIn.value ? 'Sign in to finish joining' : 'Joining…'))

async function retry(p: PendingJoin) {
  await queueJoin(p.code, p.displayName) // clears the error
  if (online.value && signedIn.value) await flushPendingJoins()
}
</script>
