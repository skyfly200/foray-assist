<script setup lang="ts">
import { liveQuery } from 'dexie'

const { isForay } = useMode()
const newName = ref('')
const forays = ref<Foray[]>([])
let sub: { unsubscribe(): void } | null = null

onMounted(() => {
  sub = liveQuery(() => useDb().forays.orderBy('startedAt').reverse().toArray()).subscribe({
    next: (rows) => (forays.value = rows),
    error: (e) => console.error('forays query failed', e),
  })
})
onBeforeUnmount(() => sub?.unsubscribe())

async function createForay() {
  const now = nowIso()
  const row: Foray = {
    id: newId(),
    name: newName.value.trim() || `Foray ${new Date().toLocaleDateString()}`,
    startedAt: now,
    updatedAt: now,
  }
  await useDb().forays.add(row)
  await enqueue('forays', row.id)
  newName.value = ''
}

async function endForay(f: Foray) {
  const now = nowIso()
  await useDb().forays.update(f.id, { endedAt: now, updatedAt: now })
  await enqueue('forays', f.id)
}
</script>

<template>
  <v-text-field
    v-model="newName"
    label="New foray (name defaults to today's date)"
    append-inner-icon="mdi-plus"
    :density="isForay ? 'default' : 'compact'"
    @click:append-inner="createForay"
    @keyup.enter="createForay"
  />
  <v-btn
    v-if="isForay"
    color="primary"
    size="x-large"
    block
    prepend-icon="mdi-plus"
    class="mb-4"
    @click="createForay"
  >
    Start foray
  </v-btn>

  <v-list v-if="forays.length" :density="isForay ? 'default' : 'compact'">
    <v-list-item
      v-for="f in forays"
      :key="f.id"
      :title="f.name"
      :subtitle="
        new Date(f.startedAt).toLocaleString() + (f.endedAt ? ' – ended ' + new Date(f.endedAt).toLocaleString() : ' – in progress')
      "
      :to="`/forays/${f.id}`"
      prepend-icon="mdi-pine-tree"
      :min-height="isForay ? 72 : undefined"
    >
      <template v-if="!f.endedAt" #append>
        <v-btn
          variant="tonal"
          :size="isForay ? 'large' : 'small'"
          prepend-icon="mdi-flag-checkered"
          @click.prevent.stop="endForay(f)"
        >
          End
        </v-btn>
      </template>
    </v-list-item>
  </v-list>
  <v-alert v-else type="info" variant="tonal">No forays yet. Create one above.</v-alert>
</template>
