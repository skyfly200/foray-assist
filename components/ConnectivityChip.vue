<script setup lang="ts">
const { online, pending, syncing, signedIn } = useSync()

const label = computed(() => {
  if (!online.value) return pending.value ? `Offline · ${pending.value} pending` : 'Offline'
  if (syncing.value) return 'Syncing…'
  if (pending.value) return `${pending.value} pending`
  return signedIn.value ? 'Synced' : 'Online'
})
const icon = computed(() => {
  if (!online.value) return 'mdi-cloud-off-outline'
  if (syncing.value) return 'mdi-cloud-sync-outline'
  if (pending.value) return 'mdi-cloud-upload-outline'
  return 'mdi-cloud-check-outline'
})
const color = computed(() => (!online.value ? 'warning' : pending.value ? 'info' : 'success'))
</script>

<template>
  <v-chip :color="color" :prepend-icon="icon" size="small" variant="flat" class="mr-2">
    {{ label }}
  </v-chip>
</template>
