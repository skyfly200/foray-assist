<template>
  <v-dialog v-model="open" max-width="440">
    <template #activator="{ props: act }">
      <slot name="activator" :props="act" />
    </template>
    <v-card rounded="xl" class="pa-2">
      <v-card-title class="text-h6">Foray title</v-card-title>
      <v-card-text>
        <v-text-field
          v-model="title"
          label="Title"
          placeholder="e.g. Mount Falcon Park"
          autofocus
          :counter="80"
          maxlength="80"
          hide-details="auto"
          @keyup.enter="save"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">Cancel</v-btn>
        <v-btn color="primary" variant="flat" :disabled="!title.trim()" :loading="saving" @click="save">Save</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
// Sets or changes a foray's title. Only the foray's owner can, since sync never writes a joined foray's row.
import { renameForay } from '~/composables/useNewFind'

const props = defineProps<{ foray: Foray }>()
const open = defineModel<boolean>({ default: false })
const title = ref('')
const saving = ref(false)

watch(open, (v) => {
  if (v) title.value = props.foray.name
}, { immediate: true })

async function save() {
  if (!title.value.trim() || saving.value) return
  saving.value = true
  try {
    await renameForay(props.foray.id, title.value)
    open.value = false
  } finally {
    saving.value = false
  }
}
</script>
