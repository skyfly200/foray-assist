<template>
  <!-- One printed page: 1, 2 (stacked) or 4 (2 x 2) forms, with dashed cut lines between them. -->
  <div class="ff-page" :class="`ff-page--${perPage}`">
    <div v-for="(it, i) in items" :key="i" class="ff-cell">
      <FieldFormSheet
        :specimen="it?.specimen ?? null"
        :foray-name="it?.forayName"
        :transcripts="it?.transcripts"
        :qr-svg="it?.qrSvg"
        :config="config"
        :size="perPage === 1 ? 'full' : perPage === 2 ? 'half' : 'quarter'"
      />
    </div>
  </div>
</template>

<script lang="ts">
import type { Specimen } from '~/utils/db'
export interface FormItem { specimen: Specimen; forayName: string; transcripts: string[]; qrSvg: string }
</script>

<script setup lang="ts">
import type { FormConfig, PerPage } from '~/utils/fieldForm'

defineProps<{ items: (FormItem | null)[]; perPage: PerPage; config: FormConfig }>()
</script>

<style scoped>
/* 186 x 255 mm fits A4 and US Letter inside 10 mm margins. */
.ff-page { width: 186mm; box-sizing: border-box; background: #fff; }
.ff-page--2, .ff-page--4 { height: 255mm; display: grid; overflow: hidden; }
.ff-page--2 { grid-template-rows: 1fr 1fr; }
.ff-page--4 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
.ff-cell { overflow: hidden; box-sizing: border-box; }
.ff-page--2 .ff-cell:nth-child(1) { padding-bottom: 4mm; border-bottom: 0.2mm dashed #888; }
.ff-page--2 .ff-cell:nth-child(2) { padding-top: 4mm; }
.ff-page--4 .ff-cell:nth-child(odd) { padding-right: 3mm; border-right: 0.2mm dashed #888; }
.ff-page--4 .ff-cell:nth-child(even) { padding-left: 3mm; }
.ff-page--4 .ff-cell:nth-child(-n + 2) { padding-bottom: 3mm; border-bottom: 0.2mm dashed #888; }
.ff-page--4 .ff-cell:nth-child(n + 3) { padding-top: 3mm; }
</style>
