<template>
  <Transition name="fa-pop">
    <div v-if="count" class="empty-bar d-flex flex-wrap align-center ga-2" role="status">
      <v-icon icon="mdi-eye-off-outline" size="18" class="text-medium-emphasis" />
      <span class="text-body-2 flex-grow-1">
        {{ count }} empty find{{ count === 1 ? '' : 's' }} {{ show ? 'shown' : 'hidden' }}
        <span class="text-medium-emphasis">(no photos, notes or species)</span>
      </span>
      <v-btn size="small" variant="text" @click="show = !show">{{ show ? 'Hide' : 'Show' }}</v-btn>
      <v-btn size="small" variant="tonal" color="error" prepend-icon="mdi-delete-sweep" :loading="busy" @click="onRemove">Remove</v-btn>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { removeEmptyFinds } from '~/composables/useFinds'

const props = defineProps<{ forayId: string; count: number }>()
const show = defineModel<boolean>('show', { default: false })
const busy = ref(false)

async function onRemove() {
  busy.value = true
  try { await removeEmptyFinds(props.forayId) } finally { busy.value = false }
}
</script>

<style scoped>
.empty-bar { padding: 8px 12px; border-radius: var(--fa-radius-sm); background: rgba(var(--v-theme-on-surface), 0.05); }
</style>
