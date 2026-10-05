<script setup lang="ts">
const supabase = useSupabaseClient()
const newTitle = ref('')

const { data: forays, refresh } = await useAsyncData('forays', async () => {
  const { data, error } = await supabase
    .from('forays')
    .select('id, title, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
})

async function createForay() {
  if (!newTitle.value.trim()) return
  const { error } = await supabase.from('forays').insert({ title: newTitle.value.trim() })
  if (error) throw error
  newTitle.value = ''
  await refresh()
}
</script>

<template>
  <v-text-field
    v-model="newTitle"
    label="New foray"
    append-inner-icon="mdi-plus"
    @click:append-inner="createForay"
    @keyup.enter="createForay"
  />
  <v-list v-if="forays?.length">
    <v-list-item
      v-for="f in forays"
      :key="f.id"
      :title="f.title"
      :subtitle="new Date(f.created_at).toLocaleString()"
      :to="`/forays/${f.id}`"
      prepend-icon="mdi-pine-tree"
    />
  </v-list>
  <v-alert v-else type="info" variant="tonal">No forays yet. Create one above.</v-alert>
</template>
