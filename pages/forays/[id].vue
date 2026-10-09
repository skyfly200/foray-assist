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
    <header class="fa-hero foray-hero mb-4" :class="{ 'hero-in-desk': isForay }">
      <div class="text-overline hero-kicker">{{ isForay ? '🍄 Foray mode' : '🔍 Review mode' }}</div>
      <h1 class="text-h5 font-weight-bold hero-title">{{ foray?.name }}</h1>
      <div v-if="foray" class="hero-sub">
        Started {{ new Date(foray.startedAt).toLocaleString() }}
        <span v-if="foray.endedAt"> · ended {{ new Date(foray.endedAt).toLocaleString() }}</span>
      </div>
      <div class="hero-share mt-2">
        <ShareForayDialog :foray="foray" />
        <span v-if="foray?.shared && foray.shared.role !== 'owner' && foray.shared.ownerName" class="hero-sub ml-2">Shared by {{ foray.shared.ownerName }}</span>
      </div>
      <div class="hero-pills d-flex flex-wrap ga-2 mt-3">
        <span class="hero-pill"><v-icon icon="mdi-leaf" size="16" /> {{ counts.finds }} find{{ counts.finds === 1 ? '' : 's' }}</span>
        <span class="hero-pill"><v-icon icon="mdi-camera" size="16" /> {{ counts.photos }} photo{{ counts.photos === 1 ? '' : 's' }}</span>
        <span class="hero-pill"><v-icon icon="mdi-star" size="16" /> {{ counts.picked }} picked</span>
      </div>
    </header>

    <div>
      <Transition name="page" mode="out-in">
        <!-- Desktop: two panes (main + sticky right column). Mobile: the columns simply stack in DOM order. -->
        <div v-if="isForay" key="foray" class="fa-split">
          <aside class="fa-desk" aria-label="Field desk">
            <section class="desk-summary" aria-label="Foray summary">
              <div class="desk-title">Field desk</div>
              <div v-if="foray" class="desk-sub">
                {{ foray.name }} · started {{ new Date(foray.startedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) }}
              </div>
              <div class="desk-stats">
                <div class="stat"><b>{{ counts.finds }}</b><span>find{{ counts.finds === 1 ? '' : 's' }}</span></div>
                <div class="stat"><b>{{ counts.photos }}</b><span>photo{{ counts.photos === 1 ? '' : 's' }}</span></div>
                <div class="stat"><b>{{ counts.picked }}</b><span>picked</span></div>
              </div>
            </section>
            <VoiceRecorder :foray-id="id" class="mb-4 desk-voice" />
            <NearbyCard v-if="foray?.shared" :foray-id="id" :foray="foray" class="mb-4" />
            <!-- FindList teleports its camera / New find action here on desktop. -->
            <div id="fa-desk-actions" class="desk-actions" />
          </aside>
          <div class="fa-split-main">
            <FindList :foray-id="id" />
            <v-divider class="my-6" />
            <SharedFindsPanel :foray-id="id" :foray="foray" />
          </div>
        </div>
        <div v-else key="review" class="fa-split">
          <div class="fa-split-main">
            <ReviewPanel :foray-id="id">
              <template #sources>
                <GooglePhotosImport :foray-id="id" />
              </template>
            </ReviewPanel>
          </div>
          <v-divider class="my-4 d-md-none" />
          <aside class="fa-desk" aria-label="Publish">
            <PublishPanel :foray-id="id" />
          </aside>
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
.hero-share :deep(.v-btn) { background: rgba(255, 255, 255, 0.22); color: inherit; }
.hero-pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 999px; background: rgba(255, 255, 255, 0.22); font-weight: 600; font-size: 0.85rem; }

.desk-summary { display: none; }
.desk-actions:empty { display: none; }

@media (min-width: 960px) {
  .foray-hero { margin-left: 0; margin-right: 0; border-radius: var(--fa-radius); padding: 14px 24px 16px; }
  .foray-hero::after { width: 120px; height: 120px; right: -30px; top: -50px; }
  .foray-hero::before { display: none; }
  .hero-title { font-size: 1.4rem !important; }
  .hero-in-desk .hero-pills, .hero-in-desk .hero-sub { display: none !important; }
  .hero-pills { margin-top: 8px !important; }

  .desk-summary { display: block; padding: 16px 18px; border-radius: var(--fa-radius); background: rgb(var(--v-theme-surface)); box-shadow: var(--fa-shadow); margin-bottom: 16px; }
  .desk-title { font-weight: 800; font-size: 1.05rem; color: rgb(var(--v-theme-primary)); }
  .desk-sub { font-size: 0.8rem; opacity: 0.7; margin: 2px 0 10px; }
  .desk-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .stat { display: flex; flex-direction: column; align-items: center; padding: 8px 4px; border-radius: var(--fa-radius-sm); background: rgba(var(--v-theme-primary), 0.08); }
  .stat b { font-size: 1.4rem; line-height: 1.1; }
  .stat span { font-size: 0.72rem; opacity: 0.75; }
}
</style>
