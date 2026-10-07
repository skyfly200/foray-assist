<script setup lang="ts">
import { liveQuery } from 'dexie'

const { isForay } = useMode()
const router = useRouter()
const newName = ref('')
const forays = ref<Foray[]>([])
const stats = reactive({ forays: 0, finds: 0, photos: 0 })
const findCounts = ref<Record<string, number>>({})
const covers = ref<Record<string, string>>({})
const loaded = ref(false)
const starting = ref(false)

const subs: { unsubscribe(): void }[] = []
const coverCache = new Map<string, { photoId: string; url: string }>()

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 5) return { text: 'Up late?', emoji: '🌙' }
  if (h < 12) return { text: 'Good morning', emoji: '🌤️' }
  if (h < 18) return { text: 'Good afternoon', emoji: '🌿' }
  return { text: 'Good evening', emoji: '🌆' }
})

// Count-up animation for the stat badges.
const shown = reactive({ forays: 0, finds: 0, photos: 0 })
const reduceMotion = () => import.meta.client && window.matchMedia('(prefers-reduced-motion: reduce)').matches
function animateTo(key: 'forays' | 'finds' | 'photos', to: number) {
  const from = shown[key]
  if (reduceMotion() || from === to) {
    shown[key] = to
    return
  }
  const t0 = performance.now()
  const dur = 700
  const step = (t: number) => {
    const p = Math.min(1, (t - t0) / dur)
    shown[key] = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)))
    if (p < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}
watch(() => stats.forays, (v) => animateTo('forays', v))
watch(() => stats.finds, (v) => animateTo('finds', v))
watch(() => stats.photos, (v) => animateTo('photos', v))

function syncCovers(rows: { forayId: string; photoId: string; blob: Blob }[], ids: Set<string>) {
  const next: Record<string, string> = {}
  for (const r of rows) {
    const hit = coverCache.get(r.forayId)
    if (hit && hit.photoId === r.photoId) {
      next[r.forayId] = hit.url
    } else {
      if (hit) URL.revokeObjectURL(hit.url)
      const url = URL.createObjectURL(r.blob)
      coverCache.set(r.forayId, { photoId: r.photoId, url })
      next[r.forayId] = url
    }
  }
  for (const [id, hit] of [...coverCache]) {
    if (!next[id] || !ids.has(id)) {
      URL.revokeObjectURL(hit.url)
      coverCache.delete(id)
    }
  }
  covers.value = next
}

onMounted(() => {
  const db = useDb()
  subs.push(
    liveQuery(() => db.forays.orderBy('startedAt').reverse().toArray()).subscribe({
      next: (rows) => {
        forays.value = rows
        loaded.value = true
      },
      error: (e) => console.error('forays query failed', e),
    }),
    liveQuery(async () => {
      const [fc, sc, pc, fs] = await Promise.all([db.forays.count(), db.specimens.count(), db.photos.count(), db.forays.toArray()])
      const counts: Record<string, number> = {}
      const cov: { forayId: string; photoId: string; blob: Blob }[] = []
      await Promise.all(
        fs.map(async (f) => {
          counts[f.id] = await db.specimens.where('forayId').equals(f.id).count()
          const p = await db.photos.where('forayId').equals(f.id).sortBy('capturedAt').then((a) => a.find((x) => x.blob instanceof Blob))
          if (p) cov.push({ forayId: f.id, photoId: p.id, blob: p.blob })
        }),
      )
      return { fc, sc, pc, counts, cov, ids: fs.map((f) => f.id) }
    }).subscribe({
      next: (r) => {
        stats.forays = r.fc
        stats.finds = r.sc
        stats.photos = r.pc
        findCounts.value = r.counts
        syncCovers(r.cov, new Set(r.ids))
      },
      error: (e) => console.error('stats query failed', e),
    }),
  )
})
onBeforeUnmount(() => {
  subs.forEach((s) => s.unsubscribe())
  coverCache.forEach((h) => URL.revokeObjectURL(h.url))
  coverCache.clear()
})

async function createForay() {
  if (starting.value) return
  starting.value = true
  try {
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
    router.push(`/forays/${row.id}`)
  } finally {
    starting.value = false
  }
}

async function endForay(f: Foray) {
  const now = nowIso()
  await useDb().forays.update(f.id, { endedAt: now, updatedAt: now })
  await enqueue('forays', f.id)
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
</script>

<template>
  <div class="fa-home">
    <section class="fa-hero fa-home__hero fa-pop-enter-active">
      <p class="fa-home__hello">{{ greeting.text }} <span aria-hidden="true">{{ greeting.emoji }}</span></p>
      <h1 class="fa-home__title">Ready to find some fungi?</h1>

      <div class="fa-home__stats" aria-label="Your totals">
        <span class="fa-badge fa-home__stat"><v-icon icon="mdi-pine-tree" size="16" />{{ shown.forays }} forays</span>
        <span class="fa-badge fa-home__stat"><v-icon icon="mdi-mushroom" size="16" />{{ shown.finds }} finds</span>
        <span class="fa-badge fa-home__stat"><v-icon icon="mdi-camera-outline" size="16" />{{ shown.photos }} photos</span>
      </div>

      <div class="fa-home__start">
        <v-btn
          color="white"
          class="fa-fab fa-home__fab"
          :class="{ 'fa-home__fab--big': isForay }"
          icon
          :loading="starting"
          aria-label="Start foray"
          @click="createForay"
        >
          <v-icon icon="mdi-map-marker-path" :size="isForay ? 44 : 32" color="primary" />
        </v-btn>
        <span class="fa-home__fab-label">Start foray</span>
        <v-text-field
          v-model="newName"
          class="fa-home__name"
          placeholder="Name it (optional, defaults to today)"
          aria-label="New foray name"
          hide-details
          density="comfortable"
          bg-color="surface"
          @keyup.enter="createForay"
        />
      </div>

      <div class="fa-home__mode fa-mobile-only"><ModeToggle /></div>
    </section>

    <OnboardingCard />

    <h2 v-if="forays.length" class="fa-home__section">Your forays</h2>

    <TransitionGroup v-if="forays.length" name="fa-list" tag="div" class="fa-home__list">
      <v-card
        v-for="(f, i) in forays"
        :key="f.id"
        :to="`/forays/${f.id}`"
        class="fa-card fa-tappable fa-home__card"
        :class="{ 'fa-home__card--compact': !isForay }"
        flat
      >
        <div class="fa-home__cover" :class="{ 'fa-home__cover--warm': i % 3 === 2 }">
          <img v-if="covers[f.id]" :src="covers[f.id]" alt="" class="fa-home__img" />
          <v-icon v-else icon="mdi-mushroom" size="44" class="fa-home__ph" />
          <span v-if="!f.endedAt" class="fa-home__live"><span class="fa-home__dot" />In progress</span>

          <v-menu location="bottom end">
            <template #activator="{ props }">
              <v-btn
                v-if="!f.endedAt"
                v-bind="props"
                icon="mdi-dots-vertical"
                size="small"
                variant="flat"
                color="surface"
                class="fa-home__more"
                aria-label="Foray actions"
                @click.prevent.stop
              />
            </template>
            <v-list density="comfortable" rounded="lg">
              <v-list-item prepend-icon="mdi-flag-checkered" title="End foray" @click="endForay(f)" />
            </v-list>
          </v-menu>
        </div>
        <div class="fa-home__body">
          <div class="fa-home__name-row">{{ f.name }}</div>
          <div class="fa-home__meta">
            <span class="fa-badge"><v-icon icon="mdi-mushroom" size="14" />{{ plural(findCounts[f.id] ?? 0, 'find') }}</span>
            <span class="fa-home__date">{{ fmtDate(f.startedAt) }}<template v-if="f.endedAt"> · ended</template></span>
          </div>
        </div>
      </v-card>
    </TransitionGroup>

    <div v-else-if="loaded" class="fa-home__empty fa-pop-enter-active">
      <svg viewBox="0 0 200 150" class="fa-home__art" aria-hidden="true">
        <ellipse cx="100" cy="132" rx="82" ry="12" fill="currentColor" opacity="0.12" />
        <path d="M30 128c10-26 18-26 28 0M150 128c8-20 16-20 24 0" stroke="currentColor" stroke-width="5" stroke-linecap="round" fill="none" opacity="0.35" />
        <rect x="88" y="78" width="24" height="50" rx="12" fill="#fff" stroke="currentColor" stroke-width="3" />
        <path d="M44 84c0-34 25-54 56-54s56 20 56 54c0 6-6 9-12 9H56c-6 0-12-3-12-9z" fill="rgb(var(--v-theme-primary))" />
        <circle cx="76" cy="62" r="8" fill="#fff" opacity="0.85" />
        <circle cx="112" cy="50" r="6" fill="#fff" opacity="0.85" />
        <circle cx="132" cy="72" r="5" fill="#fff" opacity="0.85" />
        <circle cx="94" cy="104" r="2.5" fill="currentColor" /><circle cx="106" cy="104" r="2.5" fill="currentColor" />
        <path d="M95 112q5 5 10 0" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none" />
      </svg>
      <h2 class="fa-home__empty-title">No forays yet</h2>
      <p class="fa-home__empty-text">Tap the big trail button above to start your first one. 🍄</p>
    </div>
  </div>
</template>

<style scoped>
.fa-home { max-width: 640px; margin: 0 auto; }
.fa-home__hero { border-radius: var(--fa-radius); padding: 20px 18px 22px; text-align: center; box-shadow: var(--fa-shadow); }
.fa-home__hello { margin: 0; font-weight: 600; opacity: 0.92; }
.fa-home__title { margin: 4px 0 14px; font-size: 1.5rem; line-height: 1.2; font-weight: 800; }
.fa-home__stats { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-bottom: 18px; }
.fa-home__stat { background: rgba(255, 255, 255, 0.22); color: #fff; font-variant-numeric: tabular-nums; }
.fa-home__start { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.fa-home__fab { width: 88px !important; height: 88px !important; animation: fa-home-breathe 2.8s ease-in-out infinite; }
.fa-home__fab--big { width: 112px !important; height: 112px !important; }
.fa-home__fab-label { font-weight: 800; font-size: 1.05rem; }
.fa-home__name { width: 100%; max-width: 340px; text-align: left; }
.fa-home__name :deep(.v-field) { border-radius: 999px; }
.fa-home__mode { margin-top: 16px; }
@keyframes fa-home-breathe { 50% { transform: scale(1.05); } }

.fa-home__section { margin: 22px 4px 10px; font-size: 1.1rem; font-weight: 800; }
.fa-home__list { display: grid; gap: 14px; grid-template-columns: 1fr; }
@media (min-width: 560px) { .fa-home__list { grid-template-columns: 1fr 1fr; } }
.fa-home__card { overflow: hidden; }
.fa-home__cover {
  position: relative; height: 130px; display: grid; place-items: center; color: rgba(255, 255, 255, 0.85);
  background: var(--fa-hero-gradient);
}
.fa-home__card--compact .fa-home__cover { height: 84px; }
.fa-home__cover--warm { background: var(--fa-hero-gradient-warm); }
.fa-home__img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.fa-home__ph { filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.2)); }
.fa-home__live {
  position: absolute; left: 10px; top: 10px; display: inline-flex; align-items: center; gap: 6px;
  padding: 3px 10px; border-radius: 999px; font-size: 0.72rem; font-weight: 700;
  background: rgba(var(--v-theme-surface), 0.92); color: rgb(var(--v-theme-primary));
}
.fa-home__dot { width: 8px; height: 8px; border-radius: 50%; background: rgb(var(--v-theme-primary)); animation: fa-home-blink 1.4s infinite; }
@keyframes fa-home-blink { 50% { opacity: 0.25; } }
.fa-home__more { position: absolute; right: 8px; top: 8px; }
.fa-home__body { padding: 12px 14px 14px; }
.fa-home__name-row { font-weight: 800; font-size: 1.05rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fa-home__meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 6px; }
.fa-home__date { font-size: 0.8rem; opacity: 0.7; }

@media (min-width: 960px) {
  .fa-home { max-width: none; }
  .fa-home__hero {
    display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: 'hello start' 'title start' 'stats start';
    align-content: center; column-gap: 40px; padding: 32px 40px; text-align: left;
  }
  .fa-home__hello { grid-area: hello; align-self: end; }
  .fa-home__title { grid-area: title; font-size: 2.1rem; margin: 6px 0 18px; }
  .fa-home__stats { grid-area: stats; justify-content: flex-start; margin-bottom: 0; align-self: start; }
  .fa-home__start { grid-area: start; flex-direction: row; align-items: center; gap: 16px; }
  .fa-home__fab-label { order: 1; font-size: 1.15rem; }
  .fa-home__name { order: 2; width: 300px; max-width: 300px; }
  .fa-home__section { margin: 32px 4px 14px; font-size: 1.3rem; }
  .fa-home__list { grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
  .fa-home__cover { height: 160px; }
  .fa-home__card--compact .fa-home__cover { height: 100px; }
}
@media (min-width: 960px) and (max-width: 1279.98px) {
  .fa-home__hero { grid-template-columns: 1fr; grid-template-areas: 'hello' 'title' 'stats' 'start'; }
  .fa-home__start { margin-top: 20px; flex-wrap: wrap; }
}
@media (prefers-reduced-motion: reduce) { .fa-home__fab, .fa-home__dot { animation: none; } }

.fa-home__empty { text-align: center; padding: 28px 12px; color: rgb(var(--v-theme-primary)); }
.fa-home__art { width: 200px; max-width: 70%; height: auto; }
.fa-home__empty-title { margin: 6px 0 4px; color: rgb(var(--v-theme-on-background)); font-weight: 800; }
.fa-home__empty-text { margin: 0; color: rgb(var(--v-theme-on-background)); opacity: 0.7; }
</style>
