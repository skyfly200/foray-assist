<template>
  <div class="d-inline-block">
    <v-btn prepend-icon="mdi-file-document-outline" variant="text" @click="open = true">Field form</v-btn>

    <v-dialog v-model="open" :max-width="mdAndUp ? 860 : 560" scrollable>
      <v-card class="fa-card">
        <v-card-title class="d-flex align-center ga-2 pt-4">
          <v-icon color="primary">mdi-file-document-outline</v-icon> Field form
        </v-card-title>
        <v-card-text>
          <div class="d-flex flex-wrap ga-4 mb-3">
            <div>
              <div class="text-caption text-medium-emphasis mb-1">Forms per page</div>
              <v-btn-toggle :model-value="config.perPage" mandatory density="compact" color="primary" variant="outlined" divided rounded="xl" @update:model-value="(v: PerPage) => save({ perPage: v })">
                <v-btn :value="1">1</v-btn>
                <v-btn :value="2">2</v-btn>
                <v-btn :value="4">4</v-btn>
              </v-btn-toggle>
            </div>
            <div v-if="forayCount > 1">
              <div class="text-caption text-medium-emphasis mb-1">Print</div>
              <v-btn-toggle v-model="scope" mandatory density="compact" color="primary" variant="outlined" divided rounded="xl">
                <v-btn value="one">This find</v-btn>
                <v-btn value="all">All {{ forayCount }} finds</v-btn>
              </v-btn-toggle>
            </div>
          </div>
          <v-switch v-if="config.perPage > 1" v-model="fillBlanks" color="primary" density="compact" hide-details inset label="Fill empty spots with blank forms" class="mb-2" />
          <div class="text-body-2 text-medium-emphasis mb-3">
            {{ pages.length }} {{ pages.length === 1 ? 'page' : 'pages' }}, A4 or Letter. Blank lines are left for anything not filled in.
            Choose fields in <NuxtLink to="/settings">Settings → Field form</NuxtLink>.
          </div>
          <div ref="frame" class="ff-frame">
            <div class="ff-paper-stack" :style="{ zoom }">
              <div v-for="(page, i) in pages" :key="i" class="ff-paper">
                <FieldFormPage :items="page" :per-page="config.perPage" :config="config" />
              </div>
            </div>
          </div>
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-btn variant="text" @click="open = false">Close</v-btn>
          <v-spacer />
          <v-btn color="primary" variant="flat" prepend-icon="mdi-printer" :disabled="!items.length" @click="doPrint">Print</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <Teleport to="body">
      <div v-if="printing" class="fa-print-root">
        <FieldFormPage v-for="(page, i) in pages" :key="i" :items="page" :per-page="config.perPage" :config="config" class="ff-print-page" />
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useDisplay } from 'vuetify'
import { isPendingId } from '~/utils/idCode'
import { qrPayload } from '~/utils/label'
import { paginate, type PerPage } from '~/utils/fieldForm'
import type { FormItem } from '~/components/FieldFormPage.vue'

const props = defineProps<{ specimenRowId: string }>()
const { mdAndUp } = useDisplay()
const { config, save } = useFormConfig()
const open = ref(false)
const printing = ref(false)
const scope = ref<'one' | 'all'>('one')
const fillBlanks = ref(true)
const forayCount = ref(0)
const items = ref<FormItem[]>([])
const frame = ref<HTMLElement | null>(null)
const zoom = ref(1)

const pages = computed(() => paginate(items.value, config.value.perPage, fillBlanks.value && config.value.perPage > 1))

const PAGE_PX = (206 / 25.4) * 96 // page area (186 mm) + paper padding (2 x 10 mm) in CSS px

async function itemFor(id: string, forayName: string): Promise<FormItem | null> {
  const db = useDb()
  const s = await db.specimens.get(id)
  if (!s) return null
  const notes = await db.voiceNotes.where('specimenRowId').equals(s.id).toArray()
  let qrSvg = ''
  if (!isPendingId(s.specimenId)) {
    const QR: any = (await import('qrcode')).default ?? (await import('qrcode'))
    qrSvg = await QR.toString(qrPayload(s), { type: 'svg', errorCorrectionLevel: 'M', margin: 1 })
  }
  return { specimen: s, forayName, qrSvg, transcripts: notes.sort((a, b) => a.at.localeCompare(b.at)).map((n) => n.transcript) }
}

async function load() {
  const db = useDb()
  const s = await db.specimens.get(props.specimenRowId)
  if (!s) { items.value = []; return }
  const forayName = (await db.forays.get(s.forayId))?.name ?? ''
  const all = (await db.specimens.where('forayId').equals(s.forayId).toArray()).sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  forayCount.value = all.length
  const ids = scope.value === 'all' ? all.map((x) => x.id) : [s.id]
  items.value = (await Promise.all(ids.map((id) => itemFor(id, forayName)))).filter((x): x is FormItem => !!x)
}

let ro: ResizeObserver | null = null
watch(open, async (v) => {
  ro?.disconnect()
  ro = null
  if (!v) return
  await load()
  await nextTick()
  if (!frame.value) return
  // Fit the pages inside the frame, minus its padding.
  const fit = () => { if (frame.value) zoom.value = Math.min(1, (frame.value.clientWidth - 18) / PAGE_PX) }
  fit()
  ro = new ResizeObserver(fit)
  ro.observe(frame.value)
})
watch(scope, () => { if (open.value) void load() })

function endPrint() {
  document.documentElement.classList.remove('fa-printing-form')
  printing.value = false
  window.removeEventListener('afterprint', endPrint)
}

async function doPrint() {
  await load()
  printing.value = true
  await nextTick()
  document.documentElement.classList.add('fa-printing-form')
  window.addEventListener('afterprint', endPrint)
  window.print()
}

onBeforeUnmount(() => {
  ro?.disconnect()
  endPrint()
})
</script>

<style scoped>
.ff-frame { background: rgba(var(--v-theme-on-surface), 0.06); border-radius: var(--fa-radius-sm, 8px); padding: 8px; overflow: hidden; }
.ff-paper-stack { display: flex; flex-direction: column; gap: 6mm; width: fit-content; }
.ff-paper { background: #fff; padding: 10mm; width: fit-content; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2); }
</style>

<style>
/* Printing the field form: show only the sheets, at true size. */
.fa-print-root { display: none; }
@media print {
  html.fa-printing-form body > *:not(.fa-print-root) { display: none !important; }
  html.fa-printing-form .fa-print-root { display: block; }
  /* An open dialog pins <html> (position: fixed, negative top) to block scrolling; undo that for paper. */
  html.fa-printing-form { position: static !important; top: auto !important; left: auto !important; overflow: visible !important; }
  html.fa-printing-form body { background: #fff !important; overflow: visible !important; }
  .fa-print-root .ff-print-page { break-after: page; }
  .fa-print-root .ff-print-page:last-child { break-after: auto; }
  @page { margin: 10mm; }
}
</style>
