<script setup lang="ts">
// Opened from a join link or QR code: /join/ABCDEFGH
const route = useRoute()
const router = useRouter()
const code = String(route.params.code ?? '')
</script>

<template>
  <div class="join-page">
    <JoinForayForm :initial-code="code" @joined="(id: string) => router.replace(`/forays/${id}`)" @cancel="router.replace('/')" />
  </div>
</template>

<style scoped>
.join-page { max-width: 480px; margin: 24px auto; }
</style>
