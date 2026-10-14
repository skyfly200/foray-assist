<template>
  <div class="ff-sheet">
    <header class="ff-head">
      <div>
        <div class="ff-kicker">Foray Assist · Field form</div>
        <div class="ff-id">{{ idText }}</div>
        <div class="ff-species">{{ notes.speciesGuess || '' }}<span v-if="!notes.speciesGuess" class="ff-blank ff-blank--wide">&nbsp;</span></div>
      </div>
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div v-if="qrSvg" class="ff-qr" v-html="qrSvg" />
    </header>

    <table class="ff-meta">
      <tbody>
        <tr><th>Foray</th><td>{{ forayName || '' }}</td><th>Date</th><td>{{ when }}</td></tr>
        <tr><th>Location</th><td>{{ location }}</td><th>Voucher</th><td>{{ voucher }}</td></tr>
        <tr><th>Collector</th><td /><th>Det. by</th><td /></tr>
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
      <div v-for="n in 4" :key="n" class="ff-line" />
      <template v-if="transcripts.length">
        <h4>Voice notes</h4>
        <p v-for="(t, i) in transcripts" :key="i" class="ff-transcript">“{{ t }}”</p>
      </template>
    </section>

    <section class="ff-sketch">
      <div class="ff-box"><span>Sketch / cross-section</span></div>
      <div class="ff-box"><span>Spore print</span></div>
    </section>

    <section class="ff-scale">
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div class="ff-ruler" v-html="ruler" />
      <div class="ff-scale-note">Scale. Print at 100% (turn off "fit to page"); the cm ruler should measure 15 cm. Lay the specimen next to it for photos.</div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Specimen } from '~/utils/db'
import { displayId, isPendingId } from '~/utils/idCode'
import { formatWhen, locationText } from '~/utils/label'
import { FIELD_DEFS, FIELD_GROUPS, rulerSvg } from '~/utils/fieldForm'

const props = defineProps<{ specimen: Specimen; forayName?: string; transcripts?: string[]; qrSvg?: string }>()

const notes = computed(() => props.specimen.fieldNotes ?? {})
const pending = computed(() => isPendingId(props.specimen.specimenId))
const idText = computed(() => (pending.value ? 'ID pending' : displayId(props.specimen.specimenId)))
const when = computed(() => formatWhen(props.specimen.timestamp))
const location = computed(() => locationText(props.specimen) || (props.specimen.geoprivacy === 'private' ? 'private' : ''))
const voucher = computed(() => (props.specimen.voucherId ? displayId(props.specimen.voucherId) : ''))
const transcripts = computed(() => (props.transcripts ?? []).map((t) => t.trim()).filter(Boolean))
const groups = FIELD_GROUPS.filter((g) => g.id !== 'id').map((g) => ({ ...g, fields: g.keys.map((k) => FIELD_DEFS.find((f) => f.key === k)!) }))
const ruler = rulerSvg(150)
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
.ff-blank--wide { width: 80mm; }
.ff-meta { width: 100%; border-collapse: collapse; margin: 2mm 0 3mm; }
.ff-meta th { text-align: left; font-weight: 600; font-size: 8.5pt; width: 18mm; padding: 1.2mm 2mm 0.6mm 0; white-space: nowrap; }
.ff-meta td { border-bottom: 0.2mm solid #000; padding: 1.2mm 2mm 0.6mm 0; width: 32%; }
.ff-groups { display: grid; grid-template-columns: 1fr 1fr; gap: 2mm 6mm; }
.ff-group { break-inside: avoid; }
h3 { font-size: 10pt; margin: 0 0 1mm; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 0.3mm solid #000; }
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
</style>
