<template>
  <div class="d-inline-block">
    <v-btn prepend-icon="mdi-file-document-outline" variant="text" @click="open = true">Field form</v-btn>

    <v-dialog v-model="open" :max-width="mdAndUp ? 860 : 560" scrollable>
      <v-card class="fa-card">
        <v-card-title class="d-flex align-center ga-2 pt-4">
          <v-icon color="primary">mdi-file-document-outline</v-icon> Field form
        </v-card-title>
        <v-card-text>
          <div class="text-body-2 text-medium-emphasis mb-3">
            Prints on A4 or Letter paper with a ruler for scale. Blank lines are left for anything not filled in yet.
          </div>
          <div ref="frame" class="ff-frame">
            <div class="ff-paper" :style="{ zoom }">
              <FieldFormSheet v-if="specimen" :specimen="specimen" :foray-name="forayName" :transcripts="transcripts" :qr-svg="qrSvg" />
            </div>
          </div>
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-btn variant="text" @click="open = false">Close</v-btn>
          <v-spacer />
          <v-btn color="primary" variant="flat" prepend-icon="mdi-printer" :disabled="!specimen" @click="doPrint">Print</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <Teleport to="body">
      <div v-if="printing && specimen" class="fa-print-root">
        <FieldFormSheet :specimen="specimen" :foray-name="forayName" :transcripts="transcripts" :qr-svg="qrSvg" />
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useDisplay } from 'vuetify'
import type { Specimen } from '~/utils/db'
import { isPendingId } from '~/utils/idCode'
import { qrPayload } from '~/utils/label'

const props = defineProps<{ specimenRowId: string }>()
const { mdAndUp } = useDisplay()
const open = ref(false)
const printing = ref(false)
const specimen = ref<Specimen | null>(null)
const forayName = ref('')
const transcripts = ref<string[]>([])
const qrSvg = ref('')
const frame = ref<HTMLElement | null>(null)
const zoom = ref(1)

const SHEET_PX = (206 / 25.4) * 96 // sheet (186 mm) + paper padding (2 x 10 mm) in CSS px

async function load() {
  const db = useDb()
  const s = (await db.specimens.get(props.specimenRowId)) ?? null
  specimen.value = s
  if (!s) return
  forayName.value = (await db.forays.get(s.forayId))?.name ?? ''
  const notes = await db.voiceNotes.where('specimenRowId').equals(s.id).toArray()
  transcripts.value = notes.sort((a, b) => a.at.localeCompare(b.at)).map((n) => n.transcript)
  qrSvg.value = ''
  if (!isPendingId(s.specimenId)) {
    const QR: any = (await import('qrcode')).default ?? (await import('qrcode'))
    qrSvg.value = await QR.toString(qrPayload(s), { type: 'svg', errorCorrectionLevel: 'M', margin: 1 })
  }
}

let ro: ResizeObserver | null = null
watch(open, async (v) => {
  ro?.disconnect()
  ro = null
  if (!v) return
  await load()
  await nextTick()
  if (!frame.value) return
  // Fit the sheet inside the frame, minus its padding.
  const fit = () => { if (frame.value) zoom.value = Math.min(1, (frame.value.clientWidth - 18) / SHEET_PX) }
  fit()
  ro = new ResizeObserver(fit)
  ro.observe(frame.value)
})

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
.ff-paper { background: #fff; padding: 10mm; width: fit-content; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2); }
</style>

<style>
/* Printing the field form: show only the sheet, at true size. */
.fa-print-root { display: none; }
@media print {
  html.fa-printing-form body > *:not(.fa-print-root) { display: none !important; }
  html.fa-printing-form .fa-print-root { display: block; }
  /* An open dialog pins <html> (position: fixed, negative top) to block scrolling; undo that for paper. */
  html.fa-printing-form { position: static !important; top: auto !important; left: auto !important; overflow: visible !important; }
  html.fa-printing-form body { background: #fff !important; overflow: visible !important; }
  @page { margin: 10mm; }
}
</style>
