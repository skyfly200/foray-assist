<template>
  <div class="d-inline-block">
    <v-btn prepend-icon="mdi-printer" variant="tonal" color="primary" :disabled="!specimen" @click="open = true">Print label</v-btn>

    <v-dialog v-model="open" max-width="460">
      <v-card class="fa-card">
        <v-card-title class="d-flex align-center ga-2 pt-4">
          <v-icon color="primary">mdi-sticker-text-outline</v-icon> Print label
        </v-card-title>
        <v-card-text>
          <div class="d-flex ga-2 mb-3 flex-wrap">
            <v-chip v-for="(s, i) in steps" :key="s.label" class="fa-pill" size="small"
              :color="s.state === 'todo' ? undefined : s.state === 'done' ? 'success' : 'primary'"
              :variant="s.state === 'current' ? 'flat' : 'tonal'"
              :prepend-icon="s.state === 'done' ? 'mdi-check' : s.icon">
              {{ i + 1 }}. {{ s.label }}
            </v-chip>
          </div>

          <v-card v-if="!printer.supported" variant="tonal" color="info" class="info-card mb-3 pa-3 d-flex ga-3">
            <v-icon size="28">mdi-information-outline</v-icon>
            <div class="text-body-2">{{ printer.unsupportedReason }}</div>
          </v-card>

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
          <div class="text-caption mt-2 d-flex align-center ga-1">
            <v-icon size="14" :color="printer.connected.value ? 'success' : undefined">mdi-bluetooth</v-icon>
            <template v-if="printer.connected.value">Connected: {{ printer.deviceName.value || 'printer' }}</template>
            <template v-else-if="printer.deviceName.value">Last used: {{ printer.deviceName.value }}</template>
            <template v-else>No printer connected</template>
          </div>
          <transition name="pop">
            <v-alert v-if="printer.error.value" type="error" variant="tonal" density="compact" class="mt-2">{{ printer.error.value }}</v-alert>
          </transition>
          <transition name="pop">
            <v-alert v-if="done" type="success" variant="tonal" density="compact" class="mt-2 success-alert" icon="mdi-party-popper">Sent to printer.</v-alert>
          </transition>
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-btn variant="text" @click="open = false">Close</v-btn>
          <v-spacer />
          <v-btn variant="tonal" :disabled="!printer.supported || printer.busy.value" @click="printer.connect()">
            {{ printer.connected.value ? 'Switch printer' : 'Connect' }}
          </v-btn>
          <v-btn color="primary" variant="flat" :loading="printer.busy.value" :disabled="!printer.supported || !bitmap" @click="doPrint">Print</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
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

const steps = computed(() => {
  const connected = !!printer.connected.value
  const hasPreview = !!bitmap.value
  const s = (label: string, icon: string, state: 'done' | 'current' | 'todo') => ({ label, icon, state })
  if (done.value) return [s('Connect', 'mdi-bluetooth', 'done'), s('Preview', 'mdi-eye-outline', 'done'), s('Print', 'mdi-printer', 'done')]
  if (!connected) return [s('Connect', 'mdi-bluetooth', 'current'), s('Preview', 'mdi-eye-outline', hasPreview ? 'done' : 'todo'), s('Print', 'mdi-printer', 'todo')]
  if (!hasPreview) return [s('Connect', 'mdi-bluetooth', 'done'), s('Preview', 'mdi-eye-outline', 'current'), s('Print', 'mdi-printer', 'todo')]
  return [s('Connect', 'mdi-bluetooth', 'done'), s('Preview', 'mdi-eye-outline', 'done'), s('Print', 'mdi-printer', 'current')]
})

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

<style scoped>
.info-card { border-radius: var(--fa-radius-sm) !important; }
.pop-enter-active { animation: fa-pop .35s var(--fa-ease); }
.pop-leave-active { transition: opacity .2s; }
.pop-leave-to { opacity: 0; }
.success-alert :deep(.v-icon) { animation: tada .7s var(--fa-ease); }
@keyframes tada { 0% { transform: scale(.4) rotate(-20deg); } 60% { transform: scale(1.25) rotate(8deg); } 100% { transform: none; } }
</style>
