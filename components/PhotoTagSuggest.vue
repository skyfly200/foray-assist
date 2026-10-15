<template>
  <div v-if="show" class="tag-suggest mb-3">
    <div class="d-flex align-center flex-wrap ga-2">
      <v-btn
        variant="tonal"
        color="primary"
        prepend-icon="mdi-creation"
        :loading="working"
        :disabled="!photos.length || !askable.length"
        @click="onSuggest"
      >
        Suggest tags from photos
      </v-btn>
      <span v-if="!photos.length" class="text-caption text-medium-emphasis">Add a photo first.</span>
      <span v-else-if="!askable.length" class="text-caption text-medium-emphasis">Every field a photo can show is filled.</span>
      <v-spacer />
      <v-menu v-if="vision.bytes.value > 0">
        <template #activator="{ props: mp }">
          <v-btn v-bind="mp" icon="mdi-dots-vertical" size="small" variant="text" aria-label="Photo model options" />
        </template>
        <v-list density="compact">
          <v-list-item prepend-icon="mdi-delete" :title="`Remove photo model (${size(vision.bytes.value)})`" @click="vision.remove()" />
        </v-list>
      </v-menu>
    </div>

    <div v-if="vision.status.value === 'downloading' || vision.status.value === 'loading'" class="mt-2" role="status" aria-live="polite">
      <div class="text-caption mb-1">
        {{ vision.status.value === 'downloading' ? `Downloading ${vision.model.label}… ${vision.progress.value}%` : 'Starting the photo model…' }}
      </div>
      <v-progress-linear :model-value="vision.progress.value" :indeterminate="vision.status.value === 'loading'" color="primary" rounded height="6" />
    </div>
    <div v-else-if="asking" class="text-caption text-medium-emphasis mt-2" role="status">Looking at {{ used }} photo{{ used === 1 ? '' : 's' }}…</div>

    <div v-if="message" class="text-caption mt-2" :class="{ 'text-error': isError }">{{ message }}</div>

    <v-sheet v-if="suggestions.length" class="mt-2 pa-3" rounded="lg" border>
      <div class="text-caption text-medium-emphasis mb-2">Suggested from the photos. Check each one before adding it.</div>
      <div class="d-flex flex-wrap ga-2">
        <v-chip v-for="s in suggestions" :key="s.key" variant="outlined" color="primary" class="sugg">
          <span class="text-medium-emphasis mr-1">{{ s.label }}:</span> <b>{{ s.value }}</b>
          <v-btn icon="mdi-check" size="x-small" variant="text" class="ml-1" :aria-label="`Add ${s.label}: ${s.value}`" @click="accept([s])" />
          <v-btn icon="mdi-close" size="x-small" variant="text" :aria-label="`Skip ${s.label}`" @click="drop(s)" />
        </v-chip>
      </div>
      <div class="d-flex ga-2 mt-3">
        <v-btn size="small" color="primary" variant="flat" prepend-icon="mdi-check-all" @click="accept(suggestions)">Add all</v-btn>
        <v-btn size="small" variant="text" @click="suggestions = []">Dismiss</v-btn>
      </div>
    </v-sheet>

    <v-dialog v-model="confirmOpen" max-width="420">
      <v-card :title="`Download ${vision.model.label}?`">
        <v-card-text>
          Tag suggestions use Google's Gemma model, running on this computer. It is a one-time download of about
          {{ vision.model.approxGB }} GB and needs a graphics card with a few GB of memory. Your photos never leave this device.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="confirmOpen = false">Cancel</v-btn>
          <v-btn color="primary" variant="flat" @click="confirmOpen = false; run()">Download</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDisplay } from 'vuetify'
import { updateFieldNotes, useLiveQuery } from '~/composables/useFinds'
import { requirePhotoBlob } from '~/composables/useMedia'
import { useVision } from '~/composables/useVision'
import type { Photo, Specimen } from '~/utils/db'
import { visibleKeys } from '~/utils/fieldForm'
import { askableFields, buildTagPrompt, parseTagAnswer, type TagSuggestion } from '~/utils/photoTags'

const MAX_PHOTOS = 3
const MAX_SIDE = 1024

const props = defineProps<{ find: Specimen }>()

const vision = useVision()
const { mdAndUp } = useDisplay()
const { config } = useFormConfig()
// Desktop only: phones rarely have the graphics memory, and the download is several GB.
const show = computed(() => mdAndUp.value && vision.supported.value)

const photos = useLiveQuery<Photo[]>(() => useDb().photos.where('specimenRowId').equals(props.find.id).toArray(), [])
const askable = computed(() => askableFields(props.find.fieldNotes ?? {}, visibleKeys(config.value)))

const suggestions = ref<TagSuggestion[]>([])
const confirmOpen = ref(false)
const asking = ref(false)
const used = ref(0)
const message = ref('')
const isError = ref(false)
const working = computed(() => asking.value || vision.status.value === 'downloading' || vision.status.value === 'loading')

const size = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.round(n / 1e6)} MB`)

async function onSuggest() {
  await vision.refresh()
  if (vision.status.value === 'not-downloaded') confirmOpen.value = true
  else void run()
}

/** Picked photos first, then the rest, newest last; at most MAX_PHOTOS. */
function pickPhotos(list: Photo[]): Photo[] {
  const byTime = [...list].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
  return [...byTime.filter((p) => p.isSelected), ...byTime.filter((p) => !p.isSelected)].slice(0, MAX_PHOTOS)
}

/** Shrink to MAX_SIDE so the worker is not handed 12-megapixel images; the model works at under 1000 px anyway. */
async function shrink(blob: Blob): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(blob)
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
    if (scale === 1) { bmp.close(); return blob }
    const c = new OffscreenCanvas(Math.round(bmp.width * scale), Math.round(bmp.height * scale))
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    bmp.close()
    return await c.convertToBlob({ type: 'image/jpeg', quality: 0.9 })
  } catch {
    return blob
  }
}

async function run() {
  message.value = ''
  isError.value = false
  suggestions.value = []
  const keys = askable.value
  try {
    await vision.load()
    if (!vision.isReady.value) throw new Error(vision.error.value || 'The photo model did not start')
    const chosen = pickPhotos(photos.value)
    used.value = chosen.length
    asking.value = true
    const images = await Promise.all(chosen.map(async (p) => shrink(await requirePhotoBlob(p))))
    const answer = await vision.ask(images, buildTagPrompt(keys))
    // Skip anything typed in while the model was thinking.
    const still = new Set(askableFields(props.find.fieldNotes ?? {}, visibleKeys(config.value)))
    suggestions.value = parseTagAnswer(answer, keys).filter((s) => still.has(s.key))
    if (!suggestions.value.length) message.value = 'No confident suggestions for these photos.'
  } catch (e: any) {
    isError.value = true
    message.value = e?.message ?? String(e)
  } finally {
    asking.value = false
  }
}

async function accept(list: TagSuggestion[]) {
  const patch: Record<string, string> = {}
  for (const s of list) if (!String(props.find.fieldNotes?.[s.key] ?? '').trim()) patch[s.key] = s.value
  await updateFieldNotes(props.find.id, patch)
  const done = new Set(list.map((s) => s.key))
  suggestions.value = suggestions.value.filter((s) => !done.has(s.key))
}

const drop = (s: TagSuggestion) => { suggestions.value = suggestions.value.filter((x) => x.key !== s.key) }
</script>

<style scoped>
.sugg { height: auto; min-height: 32px; }
</style>
