<script setup lang="ts">
const { mode, setMode } = useMode()
</script>

<template>
  <v-btn-toggle
    :model-value="mode"
    mandatory
    density="comfortable"
    variant="outlined"
    divided
    color="white"
    @update:model-value="(v: 'foray' | 'review') => setMode(v)"
  >
    <v-btn value="foray" prepend-icon="mdi-pine-tree" size="small">Foray</v-btn>
    <v-btn value="review" prepend-icon="mdi-clipboard-text-search-outline" size="small">Review</v-btn>
  </v-btn-toggle>
</template>
