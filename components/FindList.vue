<template>
  <div class="find-list">
    <!-- On desktop the camera zone is teleported into the page's sticky "Field desk" column. -->
    <Teleport to="#fa-desk-actions" defer :disabled="!mdAndUp">
    <div class="cam-zone">
      <div class="cam-wrap">
        <v-btn
          icon
          color="primary"
          size="x-large"
          class="fa-fab cam-fab"
          :class="{ 'fa-breathe': !finds.length && !creating }"
          :loading="creating"
          aria-label="New find: take photo"
          @click="onCamera"
        >
          <v-icon icon="mdi-camera" size="48" />
        </v-btn>
        <span v-if="burst" :key="burst" class="fa-burst" aria-hidden="true"><i v-for="n in 10" :key="n" :style="{ '--i': n }" /></span>
      </div>
      <div class="text-subtitle-1 font-weight-bold mt-3">New find</div>
      <div class="text-caption text-medium-emphasis">Tap to snap a photo and start a find</div>
      <v-btn variant="tonal" color="primary" prepend-icon="mdi-plus" class="mt-3" :disabled="creating" @click="onNew">
        New find without photo
      </v-btn>
    </div>
    <!-- Opened synchronously from the tap so the browser allows the camera; the find is created once a photo arrives. -->
    <input ref="cameraInput" type="file" accept="image/*" capture="environment" hidden @change="onCaptured" />
    </Teleport>

    <div v-if="!finds.length" class="empty text-center mt-6">
      <div class="empty-emoji" aria-hidden="true">🌿</div>
      <p class="text-medium-emphasis">No finds yet. Tap the camera when you spot something.</p>
    </div>

    <TransitionGroup name="fa-list" tag="div" class="finds-grid">
      <FindCard v-for="f in finds" :key="f.id" :find="f" :class="{ 'fa-pop-enter-active': freshIds.has(f.id) }" />
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useDisplay } from 'vuetify'
import { addPhoto, createFind, useLiveQuery } from '~/composables/useFinds'
import type { Specimen } from '~/utils/db'

const props = defineProps<{ forayId: string }>()
const { mdAndUp } = useDisplay()
const creating = ref(false)
const burst = ref(0)
const cameraInput = ref<HTMLInputElement | null>(null)
const freshIds = ref(new Set<string>())

const finds = useLiveQuery<Specimen[]>(
  async () => {
    const rows = await useDb().specimens.where('forayId').equals(props.forayId).toArray()
    return rows.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  },
  [],
)

function celebrate(id: string) {
  burst.value++
  freshIds.value = new Set(freshIds.value).add(id)
  setTimeout(() => {
    const n = new Set(freshIds.value)
    n.delete(id)
    freshIds.value = n
  }, 700)
}

function onCamera() {
  if (creating.value) return
  cameraInput.value?.click()
}

async function onCaptured(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (!files.length || creating.value) return
  creating.value = true
  try {
    const row = await createFind(props.forayId)
    for (const f of files) await addPhoto(row.id, props.forayId, f, 'capture')
    celebrate(row.id)
  } finally {
    creating.value = false
  }
}

async function onNew() {
  if (creating.value) return
  creating.value = true
  try {
    const row = await createFind(props.forayId)
    celebrate(row.id)
  } finally {
    creating.value = false
  }
}
</script>

<style scoped>
.cam-zone { display: flex; flex-direction: column; align-items: center; padding: 8px 0 4px; }
.cam-wrap { position: relative; }
.cam-fab { width: 128px !important; height: 128px !important; }
.empty-emoji { font-size: 3rem; }
.finds-grid { display: flex; flex-direction: column; gap: 16px; margin-top: 16px; }

@media (min-width: 960px) {
  /* Camera + New find card (lives in the right-hand Field desk). */
  .cam-zone { display: grid; grid-template-columns: auto 1fr; align-items: center; column-gap: 16px; text-align: left; padding: 16px 18px;
    border-radius: var(--fa-radius); background: rgb(var(--v-theme-surface)); box-shadow: var(--fa-shadow); }
  .cam-wrap { grid-row: 1 / span 2; }
  .cam-fab { width: 88px !important; height: 88px !important; }
  .cam-fab :deep(.v-icon) { font-size: 36px !important; }
  .cam-zone > .mt-3 { margin-top: 0 !important; }
  .cam-zone > .v-btn { grid-column: 1 / -1; margin-top: 12px !important; }
  .empty { margin-top: 0 !important; padding: 16px 0; }
  .finds-grid { margin-top: 0; grid-template-columns: minmax(0, 1fr); display: grid; align-items: start; }
}
@media (min-width: 1280px) {
  .finds-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

</style>
