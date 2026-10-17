<script setup lang="ts">
import { parseJoinLink } from '~/utils/sharing'
// Opened from a join link or QR code: /join/ABCDEFGH
const route = useRoute()
const router = useRouter()
const code = String(route.params.code ?? '')
// Links from the share QR also carry the foray id, name and start, so joining works offline.
const foray = parseJoinLink(route.fullPath) ?? undefined
</script>

<template>
  <div class="join-page">
    <JoinForayForm :initial-code="code" :initial-foray="foray?.forayId ? { forayId: foray.forayId, name: foray.name, startedAt: foray.startedAt } : undefined" @joined="(id: string) => router.replace(`/forays/${id}`)" @queued="router.replace('/')" @cancel="router.replace('/')" />
  </div>
</template>

<style scoped>
.join-page { max-width: 480px; margin: 24px auto; }
</style>
