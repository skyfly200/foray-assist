<template>
  <div class="find-list">
    <v-btn
      block
      size="x-large"
      color="primary"
      prepend-icon="mdi-plus"
      class="new-find"
      :loading="creating"
      @click="onNew"
    >
      New find
    </v-btn>

    <p v-if="!finds.length" class="text-medium-emphasis text-center mt-6">
      No finds yet. Tap "New find" when you spot something.
    </p>

    <FindCard v-for="f in finds" :key="f.id" :find="f" class="mt-4" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { createFind, useLiveQuery } from '~/composables/useFinds'
import type { Specimen } from '~/utils/db'

const props = defineProps<{ forayId: string }>()
const creating = ref(false)

const finds = useLiveQuery<Specimen[]>(
  async () => {
    const rows = await useDb().specimens.where('forayId').equals(props.forayId).toArray()
    return rows.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  },
  [],
)

async function onNew() {
  if (creating.value) return
  creating.value = true
  try {
    await createFind(props.forayId)
  } finally {
    creating.value = false
  }
}
</script>

<style scoped>
.new-find {
  min-height: 72px;
  font-size: 1.25rem;
}
</style>
