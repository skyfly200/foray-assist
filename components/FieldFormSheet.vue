<template>
  <div class="ff-sheet" :class="`ff-${size}`">
    <header class="ff-head">
      <div>
        <div class="ff-kicker">Foray Assist · Field form</div>
        <div class="ff-id">{{ idText }}</div>
        <div class="ff-species">{{ notes.speciesGuess || '' }}<span v-if="!notes.speciesGuess" class="ff-blank">&nbsp;</span></div>
      </div>
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div v-if="qrSvg" class="ff-qr" v-html="qrSvg" />
    </header>

    <table class="ff-meta">
      <tbody>
        <tr><th>Foray</th><td>{{ forayName || '' }}</td><th>Date</th><td>{{ when }}</td></tr>
        <tr><th>Location</th><td>{{ location }}</td><th>Voucher</th><td>{{ voucher }}</td></tr>
        <tr v-if="size !== 'quarter'"><th>Collector</th><td /><th>Det. by</th><td /></tr>
      </tbody>
    </table>

    <div class="ff-groups">
      <section v-for="g in groups" :key="g.id" class="ff-group">
        <h3>{{ g.title }}</h3>
        <div v-for="f in g.fields" :key="f.key" class="ff-row">
          <span class="ff-label">{{ f.label }}</span>
          <span class="ff-value">{{ notes[f.key] || '' }}</span>
        </div>
      </section>
    </div>

    <section class="ff-notes">
      <h3>Notes</h3>
      <div v-if="notes.notes" class="ff-notes-text">{{ notes.notes }}</div>
      <div v-for="n in noteLines" :key="n" class="ff-line" />
      <template v-if="size === 'full' && transcripts.length">
        <h4>Voice notes</h4>
        <p v-for="(t, i) in transcripts" :key="i" class="ff-transcript">“{{ t }}”</p>
      </template>
    </section>

    <section v-if="size === 'full'" class="ff-sketch">
      <div class="ff-box"><span>Sketch / cross-section</span></div>
      <div class="ff-box"><span>Spore print</span></div>
    </section>

    <section class="ff-scale">
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div class="ff-ruler" v-html="ruler" />
      <div class="ff-scale-note">Print at 100% (no "fit to page"): this ruler is {{ rulerCm }} cm.<template v-if="size === 'full'"> Lay the specimen next to it for photos.</template></div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { FieldNotes, Specimen } from '~/utils/db'
import { displayId, isPendingId } from '~/utils/idCode'
import { formatWhen, locationText } from '~/utils/label'
import { DEFAULT_FORM_CONFIG, formGroups, rulerSvg, type FormConfig } from '~/utils/fieldForm'

/** `specimen: null` prints a blank form. `size`: full page, half page (2 per page) or quarter (4 per page). */
const props = withDefaults(defineProps<{
  specimen: Specimen | null
  forayName?: string
  transcripts?: string[]
  qrSvg?: string
  config?: FormConfig
  size?: 'full' | 'half' | 'quarter'
}>(), { size: 'full', config: () => DEFAULT_FORM_CONFIG })

const sp = computed(() => props.specimen)
const notes = computed<FieldNotes>(() => sp.value?.fieldNotes ?? {})
const idText = computed(() => (!sp.value ? '' : isPendingId(sp.value.specimenId) ? 'ID pending' : displayId(sp.value.specimenId)))
const when = computed(() => (sp.value ? formatWhen(sp.value.timestamp) : ''))
const location = computed(() => (!sp.value ? '' : locationText(sp.value) || (sp.value.geoprivacy === 'private' ? 'private' : '')))
const voucher = computed(() => (sp.value?.voucherId ? displayId(sp.value.voucherId) : ''))
const transcripts = computed(() => (props.transcripts ?? []).map((t) => t.trim()).filter(Boolean))
const groups = computed(() => formGroups(props.config).filter((g) => g.id !== 'id'))
const noteLines = computed(() => (props.size === 'full' ? 4 : props.size === 'half' ? 2 : 1))
const rulerCm = computed(() => (props.size === 'quarter' ? 7 : 15))
const ruler = computed(() => rulerSvg(rulerCm.value * 10))
</script>

<style scoped>
/* Laid out in mm so the preview and the print match; fits A4 and US Letter with 10 mm margins. */
.ff-sheet {
  width: 186mm; box-sizing: border-box; padding: 0; color: #000; background: #fff;
  font: 10pt/1.35 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}
.ff-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 6mm; border-bottom: 0.6mm solid #000; padding-bottom: 2mm; }
.ff-kicker { font-size: 8pt; letter-spacing: 0.04em; text-transform: uppercase; }
.ff-id { font: 700 20pt/1.1 ui-monospace, Menlo, Consolas, monospace; margin-top: 1mm; }
.ff-species { font-size: 13pt; font-style: italic; margin-top: 1mm; min-height: 6mm; }
.ff-qr { width: 26mm; height: 26mm; flex: none; }
.ff-qr :deep(svg) { width: 100%; height: 100%; display: block; }
.ff-blank { display: inline-block; border-bottom: 0.2mm solid #000; }
.ff-blank { width: 70%; }
.ff-meta { width: 100%; border-collapse: collapse; margin: 2mm 0 3mm; }
.ff-meta th { text-align: left; font-weight: 600; font-size: 8.5pt; width: 18mm; padding: 1.2mm 2mm 0.6mm 0; white-space: nowrap; }
.ff-meta td { border-bottom: 0.2mm solid #000; padding: 1.2mm 2mm 0.6mm 0; width: 32%; }
.ff-groups { column-count: 2; column-gap: 6mm; }
.ff-group { break-inside: avoid; margin-bottom: 2mm; }
h3 { break-after: avoid; font-size: 10pt; margin: 0 0 1mm; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 0.3mm solid #000; }
h4 { font-size: 9pt; margin: 2mm 0 1mm; }
.ff-row { display: flex; gap: 2mm; align-items: baseline; min-height: 6.2mm; border-bottom: 0.15mm dotted #000; }
.ff-label { flex: none; width: 30mm; font-size: 8.5pt; }
.ff-value { flex: 1; }
.ff-notes { margin-top: 3mm; break-inside: avoid; }
.ff-notes-text { white-space: pre-wrap; margin-top: 1mm; }
.ff-line { height: 6mm; border-bottom: 0.15mm solid #000; }
.ff-transcript { font-size: 8.5pt; margin: 0 0 1mm; }
.ff-sketch { display: grid; grid-template-columns: 2fr 1fr; gap: 4mm; margin-top: 3mm; break-inside: avoid; }
.ff-box { border: 0.3mm solid #000; height: 42mm; position: relative; }
.ff-box span { position: absolute; top: 1mm; left: 1.5mm; font-size: 8pt; }
.ff-scale { margin-top: 3mm; break-inside: avoid; }
.ff-ruler :deep(svg) { display: block; }
.ff-scale-note { font-size: 7.5pt; }

/* Half page (2 per page): 186 x 125 mm */
.ff-half { font-size: 8.5pt; }
.ff-half .ff-head { padding-bottom: 1mm; }
.ff-half .ff-id { font-size: 15pt; }
.ff-half .ff-species { font-size: 10pt; min-height: 4.5mm; }
.ff-half .ff-qr { width: 18mm; height: 18mm; }
.ff-half .ff-meta { margin: 1mm 0 2mm; }
.ff-half .ff-meta th, .ff-half .ff-meta td { padding-top: 0.6mm; font-size: 8pt; }
.ff-half .ff-groups { column-count: 3; column-gap: 4mm; }
.ff-half h3 { font-size: 8pt; }
.ff-half .ff-row { min-height: 4.6mm; }
.ff-half .ff-label { width: 21mm; font-size: 7pt; }
.ff-half .ff-line { height: 5mm; }
.ff-half .ff-notes, .ff-half .ff-scale { margin-top: 1mm; }
.ff-half .ff-group { margin-bottom: 1mm; }

/* Quarter page (4 per page): 90 x 125 mm */
.ff-quarter { width: 88mm; font-size: 7pt; line-height: 1.25; }
.ff-quarter .ff-head { padding-bottom: 0.6mm; border-bottom-width: 0.4mm; gap: 2mm; }
.ff-quarter .ff-kicker { font-size: 5.5pt; }
.ff-quarter .ff-id { font-size: 11pt; }
.ff-quarter .ff-species { font-size: 8pt; min-height: 3.5mm; }
.ff-quarter .ff-qr { width: 14mm; height: 14mm; }
.ff-quarter .ff-meta { margin: 0.5mm 0 1mm; }
.ff-quarter .ff-meta th { width: 11mm; font-size: 6pt; padding: 0.4mm 1mm 0.2mm 0; }
.ff-quarter .ff-meta td { font-size: 6.5pt; padding: 0.4mm 1mm 0.2mm 0; }
.ff-quarter .ff-groups { column-count: 2; column-gap: 2.5mm; }
.ff-quarter h3 { font-size: 6pt; margin-bottom: 0.3mm; }
.ff-quarter .ff-group { margin-bottom: 0.8mm; }
.ff-quarter .ff-row { min-height: 3.9mm; gap: 1mm; }
.ff-quarter .ff-label { width: 15mm; font-size: 5.5pt; }
.ff-quarter .ff-line { height: 4mm; }
.ff-quarter .ff-notes, .ff-quarter .ff-scale { margin-top: 0.8mm; }
.ff-quarter .ff-scale-note { font-size: 5.5pt; }
</style>
