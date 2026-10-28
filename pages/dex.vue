<script setup lang="ts">
// MycoDex: one card per species you've found, numbered in the order you first found them.
import { liveQuery } from 'dexie'
import type { DexEntry, DexStats } from '~/utils/dex'
import { ensurePhotoBlob } from '~/composables/useMedia'
import { computeScores, pct, type Scores } from '~/utils/score'

type SortKey = 'number' | 'count' | 'recent' | 'name'

const entries = ref<DexEntry[]>([])
const stats = ref<DexStats | null>(null)
const covers = ref<Record<string, string>>({})
const loaded = ref(false)
const search = ref('')
const sort = ref<SortKey>('number')
const open = ref<DexEntry | null>(null)

const sorts: { value: SortKey; label: string; icon: string }[] = [
  { value: 'number', label: 'MycoDex #', icon: 'mdi-pound' },
  { value: 'count', label: 'Most found', icon: 'mdi-trophy-outline' },
  { value: 'recent', label: 'Recent', icon: 'mdi-clock-outline' },
  { value: 'name', label: 'A–Z', icon: 'mdi-sort-alphabetical-ascending' },
]

const shownEntries = computed(() => {
  const q = search.value.trim().toLowerCase()
  const list = q ? entries.value.filter((e) => e.key.includes(q)) : [...entries.value]
  if (sort.value === 'count') list.sort((a, b) => b.count - a.count || a.number - b.number)
  else if (sort.value === 'recent') list.sort((a, b) => b.last.at.localeCompare(a.last.at))
  else if (sort.value === 'name') list.sort((a, b) => a.name.localeCompare(b.name))
  return list
})

const coverCache = new Map<string, { photoId: string; url: string }>()
function syncCovers(rows: { key: string; photoId: string; blob: Blob }[]) {
  const next: Record<string, string> = {}
  for (const r of rows) {
    const hit = coverCache.get(r.key)
    if (hit?.photoId === r.photoId) next[r.key] = hit.url
    else {
      if (hit) URL.revokeObjectURL(hit.url)
      next[r.key] = URL.createObjectURL(r.blob)
      coverCache.set(r.key, { photoId: r.photoId, url: next[r.key] })
    }
  }
  for (const [k, hit] of [...coverCache]) {
    if (!next[k]) {
      URL.revokeObjectURL(hit.url)
      coverCache.delete(k)
    }
  }
  covers.value = next
}

let sub: { unsubscribe(): void } | null = null
let scoreSub: { unsubscribe(): void } | null = null
const scores = ref<Scores | null>(null)
onMounted(() => {
  const db = useDb()
  // Finds and Thoroughness (utils/score.ts), over every find on this device.
  scoreSub = liveQuery(async () => {
    const [specimens, photos, notes] = await Promise.all([db.specimens.toArray(), db.photos.toArray(), db.voiceNotes.toArray()])
    const voice: Record<string, number> = {}
    for (const n of notes) if (n.specimenRowId) voice[n.specimenRowId] = (voice[n.specimenRowId] ?? 0) + 1
    return computeScores(specimens, photos.map((p) => ({ specimenRowId: p.specimenRowId, angle: p.angle })), voice)
  }).subscribe({ next: (s) => (scores.value = s), error: (e) => console.error('score query failed', e) })
  sub = liveQuery(async () => {
    const [specimens, forays] = await Promise.all([db.specimens.toArray(), db.forays.toArray()])
    const names = Object.fromEntries(forays.map((f) => [f.id, f.name]))
    const dex = buildDex(
      specimens.map((s) => ({ ...s, speciesGuess: s.fieldNotes?.speciesGuess })),
      names,
    )
    // Cover per species: the newest find's chosen photo, else any photo from the newest find that has one.
    const ids = dex.entries.flatMap((e) => e.sightings.map((s) => s.findId))
    const photos = ids.length ? await db.photos.where('specimenRowId').anyOf(ids).toArray() : []
    const byFind = new Map<string, typeof photos>()
    for (const p of photos) {
      byFind.set(p.specimenRowId, [...(byFind.get(p.specimenRowId) ?? []), p])
    }
    const cov: { key: string; photoId: string; blob: Blob }[] = []
    const fetch: typeof photos = []
    for (const e of dex.entries) {
      for (const s of e.sightings) {
        const ps = byFind.get(s.findId)
        if (!ps?.length) continue
        const best = ps.find((x) => x.isSelected) ?? ps.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))[0]
        // A photo from another device downloads now; until then use one this device already has.
        if (!best.blob) fetch.push(best)
        const p = best.blob ? best : ps.find((x) => x.blob)
        if (!p) continue
        cov.push({ key: e.key, photoId: p.id, blob: p.blob! })
        break
      }
    }
    return { ...dex, cov, fetch }
  }).subscribe({
    next: (r) => {
      const known = new Set(entries.value.map((e) => e.key))
      entries.value = r.entries
      stats.value = r.stats
      syncCovers(r.cov)
      r.fetch.forEach((p) => void ensurePhotoBlob(p))
      if (open.value) open.value = r.entries.find((e) => e.key === open.value!.key) ?? null
      // Species that show up while the page is open get the party; the first load does not.
      const added = r.entries.filter((e) => !known.has(e.key)).map((e) => e.key)
      if (loaded.value && added.length) celebrate(added)
      loaded.value = true
    },
    error: (e) => console.error('dex query failed', e),
  })
})
// Cover colour is picked from the genus, so related species sit together in colour.
const TONES = ['', 'fa-dex__cover--warm', 'fa-dex__cover--sky', 'fa-dex__cover--berry']
const tone = (e: DexEntry) => TONES[[...(e.genus || e.name)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % TONES.length]
// A species first seen in the last week gets a NEW sticker.
const isRecent = (e: DexEntry) => Date.now() - Date.parse(e.first.at) < 7 * 24 * 60 * 60 * 1000

const fresh = ref<Set<string>>(new Set())
let freshTimer: ReturnType<typeof setTimeout> | undefined
function celebrate(keys: string[]) {
  fresh.value = new Set(keys)
  clearTimeout(freshTimer)
  freshTimer = setTimeout(() => (fresh.value = new Set()), 2400)
}

onBeforeUnmount(() => {
  sub?.unsubscribe()
  scoreSub?.unsubscribe()
  clearTimeout(freshTimer)
  coverCache.forEach((h) => URL.revokeObjectURL(h.url))
  coverCache.clear()
})

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const plural = (n: number, w: string) => `${n} ${w}${n === 1 || w.endsWith('species') ? '' : 's'}`
const idRate = computed(() => (stats.value?.finds ? Math.round((stats.value.identified / stats.value.finds) * 100) : 0))
const mapsUrl = (lat: number, lon: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`
</script>

<template>
  <div class="fa-dex">
    <section class="fa-hero fa-dex__hero fa-pop-enter-active">
      <p class="fa-dex__kicker"><v-icon icon="mdi-book-open-variant" size="18" /> MycoDex</p>
      <h1 class="fa-dex__title">
        <template v-if="stats?.species">{{ stats.species }} species found</template>
        <template v-else>Your field guide fills in as you go</template>
      </h1>

      <div v-if="stats" class="fa-dex__stats" aria-label="MycoDex stats">
        <div class="fa-dex__stat"><span aria-hidden="true">🍄</span><strong>{{ stats.species }}</strong><span>species</span></div>
        <div class="fa-dex__stat"><span aria-hidden="true">🧬</span><strong>{{ stats.genera }}</strong><span>{{ stats.genera === 1 ? 'genus' : 'genera' }}</span></div>
        <div class="fa-dex__stat"><span aria-hidden="true">📸</span><strong>{{ stats.finds }}</strong><span>finds</span></div>
        <div class="fa-dex__stat"><span aria-hidden="true">🌲</span><strong>{{ stats.forays }}</strong><span>forays</span></div>
        <div class="fa-dex__stat"><span aria-hidden="true">🏷️</span><strong>{{ idRate }}%</strong><span>identified</span></div>
      </div>

      <div v-if="stats?.mostFound || stats?.newest" class="fa-dex__highlights">
        <span v-if="stats.mostFound" class="fa-badge fa-dex__hl">
          <v-icon icon="mdi-trophy-outline" size="16" />Most found: <em>{{ stats.mostFound.name }}</em> ×{{ stats.mostFound.count }}
        </span>
        <span v-if="stats.newest" class="fa-badge fa-dex__hl">
          <v-icon icon="mdi-new-box" size="16" />Newest: <em>{{ stats.newest.name }}</em> · {{ fmtDate(stats.newest.at) }}
        </span>
        <span v-if="stats.unidentified" class="fa-badge fa-dex__hl">
          <v-icon icon="mdi-help-circle-outline" size="16" />{{ plural(stats.unidentified, 'find') }} still unnamed
        </span>
      </div>
    </section>

    <section v-if="scores?.total" class="fa-card fa-dex__scores" aria-label="Your scores">
      <div class="fa-dex__score">
        <v-icon icon="mdi-mushroom-outline" size="22" color="primary" />
        <div>
          <div class="fa-dex__score-num">{{ scores.finds }}</div>
          <div class="fa-dex__score-label">Finds score</div>
          <div class="fa-dex__score-sub">{{ plural(scores.species, 'species') }} · {{ scores.total - scores.finds }} not counted yet</div>
        </div>
      </div>
      <div class="fa-dex__score">
        <v-progress-circular :model-value="Math.round(scores.thoroughness * 100)" :size="44" :width="5" color="primary">
          <span class="text-caption font-weight-bold">{{ pct(scores.thoroughness) }}</span>
        </v-progress-circular>
        <div>
          <div class="fa-dex__score-label">Thoroughness</div>
          <div class="fa-dex__score-sub">{{ plural(scores.complete, 'complete record') }}</div>
        </div>
      </div>
      <div v-if="scores.streak.best" class="fa-dex__score">
        <v-icon icon="mdi-fire" size="22" color="warning" />
        <div>
          <div class="fa-dex__score-num">{{ scores.streak.current }}</div>
          <div class="fa-dex__score-label">Day streak</div>
          <div class="fa-dex__score-sub">Best {{ scores.streak.best }}</div>
        </div>
      </div>
      <div class="fa-dex__badges">
        <span
          v-for="b in scores.badges"
          :key="b.id"
          class="fa-badge fa-dex__badge"
          :class="{ 'fa-dex__badge--off': !b.earned }"
          :title="b.detail"
        >
          <v-icon :icon="b.icon" size="16" />{{ b.label }}
        </span>
      </div>
      <p class="fa-dex__score-help">A find counts toward your Finds score once its record is half complete. Use Guided capture on a find to fill it in.</p>
    </section>

    <div v-if="entries.length" class="fa-dex__tools">
      <v-text-field
        v-model="search"
        class="fa-dex__search"
        placeholder="Search species"
        aria-label="Search species"
        prepend-inner-icon="mdi-magnify"
        hide-details
        clearable
        density="comfortable"
        variant="solo"
        flat
      />
      <v-chip-group v-model="sort" mandatory selected-class="text-primary" aria-label="Sort">
        <v-chip v-for="s in sorts" :key="s.value" :value="s.value" :prepend-icon="s.icon" variant="tonal" size="small">{{ s.label }}</v-chip>
      </v-chip-group>
    </div>

    <TransitionGroup v-if="shownEntries.length" name="fa-list" tag="div" class="fa-dex__grid">
      <button
        v-for="e in shownEntries"
        :key="e.key"
        type="button"
        class="fa-card fa-tappable fa-dex__card"
        :class="{ 'fa-dex__card--new': fresh.has(e.key) }"
        :aria-label="`${dexNo(e.number)} ${e.name}, found ${plural(e.count, 'time')}`"
        @click="open = e"
      >
        <div class="fa-dex__cover" :class="tone(e)">
          <img v-if="covers[e.key]" :src="covers[e.key]" alt="" class="fa-dex__img" />
          <v-icon v-else icon="mdi-mushroom" size="40" class="fa-dex__ph" />
          <span class="fa-dex__no">{{ dexNo(e.number) }}</span>
          <span class="fa-dex__count" :title="`Found ${plural(e.count, 'time')}`">×{{ e.count }}</span>
          <span v-if="isRecent(e)" class="fa-dex__new" aria-hidden="true">NEW</span>
          <span v-if="fresh.has(e.key)" :key="e.key" class="fa-burst" aria-hidden="true"><i v-for="n in 10" :key="n" :style="{ '--i': n }" /></span>
        </div>
        <div class="fa-dex__body">
          <div class="fa-dex__name">{{ e.name }}</div>
          <div class="fa-dex__seen">
            <v-icon icon="mdi-flag-variant-outline" size="14" /><span>First {{ fmtDate(e.first.at) }} · {{ e.first.forayName }}</span>
          </div>
          <div v-if="e.count > 1" class="fa-dex__seen">
            <v-icon icon="mdi-history" size="14" /><span>Last {{ fmtDate(e.last.at) }} · {{ e.last.forayName }}</span>
          </div>
        </div>
      </button>
    </TransitionGroup>

    <p v-else-if="entries.length" class="fa-dex__none">Nothing called “{{ search }}” yet. 🔍</p>

    <div v-else-if="loaded" class="fa-dex__empty fa-pop-enter-active">
      <v-icon icon="mdi-book-open-page-variant-outline" size="56" class="fa-sway" />
      <h2 class="fa-dex__empty-title">Page one is still blank</h2>
      <p class="fa-dex__empty-text">
        Give a find a species guess and it gets its own card here, numbered in the order you found it.
        <template v-if="stats?.unidentified">You have {{ plural(stats.unidentified, 'find') }} waiting for a name. 🕵️</template>
      </p>
      <v-btn to="/" color="primary" rounded="xl" variant="tonal" prepend-icon="mdi-pine-tree" class="mt-3">Go to forays</v-btn>
    </div>

    <v-dialog :model-value="!!open" max-width="520" scrollable @update:model-value="(v: boolean) => !v && (open = null)">
      <v-card v-if="open" class="fa-dex__detail" rounded="xl">
        <div class="fa-dex__dcover" :class="tone(open)">
          <img v-if="covers[open.key]" :src="covers[open.key]" alt="" class="fa-dex__img" />
          <v-icon v-else icon="mdi-mushroom" size="56" class="fa-dex__ph" />
          <span class="fa-dex__no">{{ dexNo(open.number) }}</span>
          <v-btn icon="mdi-close" size="small" variant="flat" color="surface" class="fa-dex__close" aria-label="Close" @click="open = null" />
        </div>
        <v-card-title class="fa-dex__dname">{{ open.name }}</v-card-title>
        <v-card-text>
          <div class="fa-dex__dstats">
            <span class="fa-badge"><v-icon icon="mdi-mushroom" size="14" />{{ plural(open.count, 'find') }}</span>
            <span class="fa-badge"><v-icon icon="mdi-pine-tree" size="14" />{{ plural(open.forayCount, 'foray') }}</span>
            <span class="fa-badge"><v-icon icon="mdi-flag-variant-outline" size="14" />First {{ fmtDate(open.first.at) }}</span>
          </div>
          <h3 class="fa-dex__dhead">Sightings</h3>
          <v-list density="comfortable" class="pa-0">
            <v-list-item
              v-for="s in open.sightings"
              :key="s.findId"
              :to="`/forays/${s.forayId}`"
              :title="s.forayName"
              :subtitle="fmtDate(s.at)"
              prepend-icon="mdi-map-marker-outline"
              rounded="lg"
            >
              <template v-if="s.latitude != null && s.longitude != null" #append>
                <v-btn
                  :href="mapsUrl(s.latitude, s.longitude)"
                  target="_blank"
                  rel="noopener"
                  icon="mdi-map-outline"
                  size="small"
                  variant="text"
                  aria-label="Open location in maps"
                  @click.stop
                />
              </template>
            </v-list-item>
          </v-list>
        </v-card-text>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.fa-dex { max-width: 640px; margin: 0 auto; }
.fa-dex__hero { border-radius: var(--fa-radius); padding: 20px 18px 22px; box-shadow: var(--fa-shadow); }
.fa-dex__kicker { display: inline-flex; align-items: center; gap: 6px; margin: 0; font-weight: 700; opacity: 0.92; }
.fa-dex__title { margin: 4px 0 14px; font-size: 1.5rem; line-height: 1.2; font-weight: 800; }
.fa-dex__scores { display: flex; flex-wrap: wrap; gap: 14px 22px; align-items: center; padding: 14px 16px; margin-top: 14px; }
.fa-dex__score { display: flex; align-items: center; gap: 10px; }
.fa-dex__score-num { font-size: 1.5rem; font-weight: 800; line-height: 1; }
.fa-dex__score-label { font-weight: 700; font-size: 0.9rem; }
.fa-dex__score-sub { font-size: 0.75rem; opacity: 0.7; }
.fa-dex__badges { display: flex; flex-wrap: wrap; gap: 6px; width: 100%; }
.fa-dex__badge { gap: 4px; }
.fa-dex__badge--off { opacity: 0.4; filter: grayscale(1); }
.fa-dex__score-help { width: 100%; margin: 0; font-size: 0.78rem; opacity: 0.7; }
.fa-dex__stats { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
.fa-dex__stat {
  display: flex; flex-direction: column; align-items: center; padding: 8px 2px; border-radius: 14px;
  background: rgba(255, 255, 255, 0.18); font-variant-numeric: tabular-nums;
}
.fa-dex__stat strong { font-size: 1.3rem; line-height: 1.1; font-weight: 800; }
.fa-dex__stat span { font-size: 0.7rem; font-weight: 600; opacity: 0.9; }
.fa-dex__stat > span:first-child { font-size: 0.95rem; opacity: 1; line-height: 1.2; }
.fa-dex__highlights { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.fa-dex__hl { background: rgba(255, 255, 255, 0.22); color: #fff; max-width: 100%; }
.fa-dex__hl em { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.fa-dex__tools { display: flex; flex-direction: column; gap: 4px; margin: 16px 0 8px; }
.fa-dex__search :deep(.v-field) { border-radius: 999px; box-shadow: var(--fa-shadow); }

.fa-dex__grid { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
@media (min-width: 560px) { .fa-dex__grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.fa-dex__card {
  display: flex; flex-direction: column; overflow: hidden; padding: 0; border: 0; text-align: left; font: inherit; cursor: pointer;
  background: rgb(var(--v-theme-surface)); color: rgb(var(--v-theme-on-surface));
}
.fa-dex__card:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.fa-dex__cover, .fa-dex__dcover {
  position: relative; aspect-ratio: 1; display: grid; place-items: center; color: rgba(255, 255, 255, 0.85);
  background: var(--fa-hero-gradient);
}
.fa-dex__dcover { aspect-ratio: 16 / 10; }
.fa-dex__cover--warm { background: var(--fa-hero-gradient-warm); }
.fa-dex__cover--sky { background: var(--fa-hero-gradient-sky); }
.fa-dex__cover--berry { background: var(--fa-hero-gradient-berry); }
.fa-dex__new {
  position: absolute; left: 50%; bottom: 8px; transform: translateX(-50%) rotate(-4deg); padding: 2px 10px; border-radius: 6px;
  font-size: 0.7rem; font-weight: 900; letter-spacing: 0.08em; color: #3b2300; background: #ffd23f; box-shadow: 0 3px 8px rgba(0, 0, 0, 0.2);
}
.fa-dex__card--new { animation: fa-dex-wiggle .6s var(--fa-ease) 2; }
@keyframes fa-dex-wiggle { 25% { transform: rotate(-2deg) scale(1.03); } 75% { transform: rotate(2deg) scale(1.03); } }
.fa-dex__img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.fa-dex__ph { filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.2)); }
.fa-dex__no, .fa-dex__count {
  position: absolute; top: 8px; padding: 2px 8px; border-radius: 999px; font-size: 0.72rem; font-weight: 800;
  font-variant-numeric: tabular-nums; background: rgba(var(--v-theme-surface), 0.92); color: rgb(var(--v-theme-primary));
}
.fa-dex__no { left: 8px; }
.fa-dex__count { right: 8px; }
.fa-dex__close { position: absolute; right: 8px; top: 8px; }
.fa-dex__body { padding: 10px 12px 12px; min-width: 0; }
.fa-dex__name { font-weight: 800; font-style: italic; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fa-dex__seen { display: flex; align-items: center; gap: 4px; margin-top: 4px; font-size: 0.74rem; opacity: 0.72; }
.fa-dex__seen span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fa-dex__none { margin: 20px 4px; opacity: 0.7; }

.fa-dex__dname { font-style: italic; font-weight: 800; white-space: normal; }
.fa-dex__dstats { display: flex; flex-wrap: wrap; gap: 6px; }
.fa-dex__dhead { margin: 16px 0 4px; font-size: 0.95rem; font-weight: 800; }

.fa-dex__empty { text-align: center; padding: 28px 12px; color: rgb(var(--v-theme-primary)); }
.fa-dex__empty-title { margin: 6px 0 4px; color: rgb(var(--v-theme-on-background)); font-weight: 800; }
.fa-dex__empty-text { margin: 0; color: rgb(var(--v-theme-on-background)); opacity: 0.7; }

@media (min-width: 960px) {
  .fa-dex { max-width: none; }
  .fa-dex__hero { padding: 28px 40px; }
  .fa-dex__title { font-size: 2.1rem; }
  .fa-dex__stats { max-width: 620px; }
  .fa-dex__tools { flex-direction: row; align-items: center; gap: 16px; }
  .fa-dex__search { max-width: 340px; }
  .fa-dex__grid { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
}
</style>
