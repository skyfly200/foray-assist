<script setup lang="ts">
// Foray detail. Foray Mode: log finds in the field (photos, voice, notes, labels).
// Review Mode: import/group photos, curate, and publish to iNaturalist.
import { liveQuery } from 'dexie'

const route = useRoute()
const id = route.params.id as string
const { isForay } = useMode()

const foray = ref<Foray | null | undefined>(undefined)
let sub: { unsubscribe(): void } | null = null

onMounted(() => {
  sub = liveQuery(() => useDb().forays.get(id)).subscribe({ next: (r) => (foray.value = r ?? null) })
})
onBeforeUnmount(() => {
  sub?.unsubscribe()
  countsSub?.unsubscribe()
})

// Live counts for the hero (read-only; same Dexie tables the panels use).
const counts = ref({ finds: 0, photos: 0, picked: 0 })
let countsSub: { unsubscribe(): void } | null = null
onMounted(() => {
  countsSub = liveQuery(async () => {
    const db = useDb()
    const finds = await db.specimens.where('forayId').equals(id).count()
    const photos = await db.photos.where('forayId').equals(id).toArray()
    return { finds, photos: photos.length, picked: photos.filter((p) => p.isSelected).length }
  }).subscribe({ next: (c) => (counts.value = c), error: () => {} })
})
</script>

<template>
  <div v-if="foray === null">
    <v-alert type="warning" variant="tonal" class="mb-4">Foray not found.</v-alert>
    <v-btn to="/" prepend-icon="mdi-arrow-left">Back to forays</v-btn>
  </div>
  <template v-else>
    <header class="fa-hero foray-hero mb-4">
      <div class="text-overline hero-kicker">{{ isForay ? '🍄 Foray mode' : '🔍 Review mode' }}</div>
      <h1 class="text-h5 font-weight-bold hero-title">{{ foray?.name }}</h1>
      <div v-if="foray" class="hero-sub">
        Started {{ new Date(foray.startedAt).toLocaleString() }}
        <span v-if="foray.endedAt"> · ended {{ new Date(foray.endedAt).toLocaleString() }}</span>
      </div>
      <div class="d-flex flex-wrap ga-2 mt-3">
        <span class="hero-pill"><v-icon icon="mdi-leaf" size="16" /> {{ counts.finds }} find{{ counts.finds === 1 ? '' : 's' }}</span>
        <span class="hero-pill"><v-icon icon="mdi-camera" size="16" /> {{ counts.photos }} photo{{ counts.photos === 1 ? '' : 's' }}</span>
        <span class="hero-pill"><v-icon icon="mdi-star" size="16" /> {{ counts.picked }} picked</span>
      </div>
    </header>

    <div>
      <Transition name="page" mode="out-in">
        <div v-if="isForay" key="foray">
          <VoiceRecorder :foray-id="id" class="mb-4" />
          <FindList :foray-id="id" />
        </div>
        <div v-else key="review">
          <ReviewPanel :foray-id="id">
            <template #sources>
              <GooglePhotosImport :foray-id="id" />
            </template>
          </ReviewPanel>
          <v-divider class="my-4" />
          <PublishPanel :foray-id="id" />
        </div>
      </Transition>
    </div>
  </template>
</template>

<style scoped>
.foray-hero { margin-left: -16px; margin-right: -16px; }
.hero-kicker { opacity: 0.9; }
.hero-title { line-height: 1.2; word-break: break-word; }
.hero-sub { opacity: 0.9; font-size: 0.85rem; }
.hero-pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 999px; background: rgba(255, 255, 255, 0.22); font-weight: 600; font-size: 0.85rem; }
</style>
