<template>
  <v-dialog v-model="open" max-width="380">
    <template #activator="{ props: act }">
      <slot name="activator" :props="act" />
    </template>
    <v-card rounded="xl" class="pa-2" :title="`Delete ${foray.name}?`">
      <v-card-text>
        This removes the foray with its finds, photos and voice notes from this device and from your account.
        <template v-if="foray.shared">It is also removed for everyone it is shared with.</template>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">Cancel</v-btn>
        <v-btn color="error" variant="flat" :loading="deleting" data-testid="confirm-delete-foray" @click="remove">Delete</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
// Deletes a foray after confirmation. Only the foray's owner can (see canEditForay); the parent decides where to go next.
import { deleteForay } from '~/composables/useNewFind'

const props = defineProps<{ foray: Foray }>()
const emit = defineEmits<{ deleted: [] }>()
const open = defineModel<boolean>({ default: false })
const deleting = ref(false)

async function remove() {
  if (deleting.value) return
  deleting.value = true
  try {
    await deleteForay(props.foray.id)
    open.value = false
    emit('deleted')
  } finally {
    deleting.value = false
  }
}
</script>
