<template>
  <v-dialog v-model="open" max-width="440">
    <template #activator="{ props: act }">
      <slot name="activator" :props="act">
        <v-btn v-bind="act" variant="tonal" rounded="xl" prepend-icon="mdi-account-multiple-plus">Join a foray</v-btn>
      </slot>
    </template>
    <JoinForayForm :initial-code="initialCode" @joined="onJoined" @cancel="open = false" />
  </v-dialog>
</template>

<script setup lang="ts">
defineProps<{ initialCode?: string }>()
const open = ref(false)
const router = useRouter()
function onJoined(id: string) {
  open.value = false
  router.push(`/forays/${id}`)
}
</script>
