<template>
  <div class="d-inline-block">
    <v-btn prepend-icon="mdi-printer" variant="tonal" :disabled="!specimen" @click="open = true">Print label</v-btn>

    <v-dialog v-model="open" max-width="460">
      <v-card>
        <v-card-title>Print label</v-card-title>
        <v-card-text>
          <v-alert v-if="!printer.supported" type="info" variant="tonal" density="compact" class="mb-3">
            {{ printer.unsupportedReason }}
          </v-alert>

          <LabelPreview v-if="specimen" :specimen="specimen" @bitmap="(b) => (bitmap = b)" />

          <v-select
            class="mt-3"
            label="Printer protocol"
            density="comfortable"
            hide-details
            :items="protocols"
            :model-value="printer.settings.value.protocol"
            @update:model-value="(v: PrinterProtocol) => printer.saveSettings({ protocol: v })"
          />
          <div class="text-caption mt-2">
            <template v-if="printer.connected.value">Connected: {{ printer.deviceName.value || 'printer' }}</template>
            <template v-else-if="printer.deviceName.value">Last used: {{ printer.deviceName.value }}</template>
            <template v-else>No printer connected</template>
          </div>
          <v-alert v-if="printer.error.value" type="error" variant="tonal" density="compact" class="mt-2">{{ printer.error.value }}</v-alert>
          <v-alert v-if="done" type="success" variant="tonal" density="compact" class="mt-2">Sent to printer.</v-alert>
        </v-card-text>
        <v-card-actions>
          <v-btn @click="open = false">Close</v-btn>
          <v-spacer />
          <v-btn :disabled="!printer.supported || printer.busy.value" @click="printer.connect()">
            {{ printer.connected.value ? 'Switch printer' : 'Connect' }}
          </v-btn>
          <v-btn color="primary" variant="flat" :loading="printer.busy.value" :disabled="!printer.supported || !bitmap" @click="doPrint">Print</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Specimen } from '~/utils/db'
import type { MonoBitmap } from '~/utils/label'
import type { PrinterProtocol } from '~/composables/usePrinter'

const props = defineProps<{ specimenRowId: string }>()
const printer = usePrinter()
const open = ref(false)
const specimen = ref<Specimen | null>(null)
const bitmap = ref<MonoBitmap | null>(null)
const done = ref(false)
const protocols = [
  { title: 'ESC/POS (Phomemo, generic receipt-style)', value: 'escpos' },
  { title: 'TSPL (label printers)', value: 'tspl' },
]

async function load() {
  specimen.value = (await useDb().specimens.get(props.specimenRowId)) ?? null
}

watch(open, async (v) => {
  if (!v) return
  done.value = false
  await Promise.all([load(), printer.loadSettings()])
  if (printer.supported) printer.reconnect()
})

async function doPrint() {
  if (!bitmap.value || !specimen.value) return
  done.value = false
  if (!(await printer.print(bitmap.value))) return
  const t = nowIso()
  await useDb().specimens.update(props.specimenRowId, { printedLabelAt: t, updatedAt: t })
  await enqueue('specimens', props.specimenRowId)
  await load()
  done.value = true
}
</script>
