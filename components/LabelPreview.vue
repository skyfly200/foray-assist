<template>
  <div>
    <canvas ref="el" class="label-preview" :width="W" :height="H" aria-label="Label preview" />
    <div class="text-caption text-medium-emphasis mt-1">50 × 30 mm, 1-bit as printed</div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import type { Specimen } from '~/utils/db'
import { renderLabelBitmap, bitmapToRgba, LABEL_WIDTH_PX as W, LABEL_HEIGHT_PX as H, type MonoBitmap } from '~/utils/label'

const props = defineProps<{ specimen: Specimen }>()
const emit = defineEmits<{ (e: 'bitmap', b: MonoBitmap): void }>()
const el = ref<HTMLCanvasElement | null>(null)

async function draw() {
  if (!el.value) return
  const bmp = await renderLabelBitmap(props.specimen)
  const ctx = el.value.getContext('2d')!
  ctx.putImageData(new ImageData(bitmapToRgba(bmp), W, H), 0, 0)
  emit('bitmap', bmp)
}
onMounted(draw)
watch(() => props.specimen, draw, { deep: true })
</script>

<style scoped>
.label-preview { width: 100%; max-width: 400px; border: 1px solid rgba(128,128,128,.5); background: #fff; image-rendering: pixelated; }
</style>
