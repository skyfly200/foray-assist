<script setup lang="ts">
const { online, pending, syncing, signedIn } = useSync()

const label = computed(() => {
  if (!online.value) return pending.value ? `Offline · ${pending.value}` : 'Offline'
  // Without an account nothing can sync, so "pending" would be misleading.
  if (!signedIn.value) return 'Saved on device'
  if (syncing.value) return 'Syncing'
  if (pending.value) return `${pending.value} pending`
  return 'Synced'
})
const icon = computed(() => {
  if (!online.value) return 'mdi-cloud-off-outline'
  if (!signedIn.value) return 'mdi-cellphone-check'
  if (syncing.value) return 'mdi-sync'
  if (pending.value) return 'mdi-cloud-upload-outline'
  return 'mdi-cloud-check-outline'
})
const tone = computed(() =>
  !online.value ? 'warning' : signedIn.value && (pending.value || syncing.value) ? 'info' : 'success',
)
</script>

<template>
  <span class="fa-conn" :class="[`fa-conn--${tone}`, { 'is-syncing': online && syncing }]" role="status" aria-live="polite">
    <v-icon :icon="icon" size="16" class="fa-conn__icon" />
    <span class="fa-conn__label">{{ label }}</span>
  </span>
</template>

<style scoped>
.fa-conn {
  --c: var(--v-theme-success);
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 160px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  white-space: nowrap;
  color: rgb(var(--c));
  background: rgba(var(--c), 0.16);
  transition: background 0.3s, color 0.3s;
}
.fa-conn--warning { --c: var(--v-theme-warning); }
.fa-conn--info { --c: var(--v-theme-info); }
.fa-conn__label { overflow: hidden; text-overflow: ellipsis; }
.fa-conn.is-syncing .fa-conn__icon { animation: fa-conn-spin 1.1s linear infinite; }
.fa-conn--warning { animation: fa-conn-breathe 2.4s ease-in-out infinite; }
@keyframes fa-conn-spin { to { transform: rotate(360deg); } }
@keyframes fa-conn-breathe { 50% { background: rgba(var(--c), 0.3); } }
</style>
