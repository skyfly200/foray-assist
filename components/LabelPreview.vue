<template>
  <div class="sticker-wrap">
    <div class="sticker">
      <canvas ref="el" class="label-preview" :width="W" :height="H" aria-label="Label preview" />
    </div>
    <div class="text-caption text-medium-emphasis mt-3 text-center">50 × 30 mm, 1-bit as printed</div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import type { Specimen } from '~/utils/db'
import { isPendingId } from '~/utils/idCode'
import { renderLabelBitmap, bitmapToRgba, LABEL_WIDTH_PX as W, LABEL_HEIGHT_PX as H, type MonoBitmap } from '~/utils/label'

const props = defineProps<{ specimen: Specimen }>()
const emit = defineEmits<{ (e: 'bitmap', b: MonoBitmap): void }>()
const el = ref<HTMLCanvasElement | null>(null)

async function draw() {
  if (!el.value || isPendingId(props.specimen.specimenId)) return
  const bmp = await renderLabelBitmap(props.specimen)
  const ctx = el.value.getContext('2d')!
  ctx.putImageData(new ImageData(bitmapToRgba(bmp), W, H), 0, 0)
  emit('bitmap', bmp)
}
onMounted(draw)
watch(() => props.specimen, draw, { deep: true })
</script>

<style scoped>
.sticker-wrap { padding: 12px 8px 4px; }
.sticker {
  width: fit-content; max-width: 100%; margin: 0 auto; padding: 8px; background: #fff;
  border-radius: 14px; transform: rotate(-2deg); box-shadow: var(--fa-shadow-lift);
  transition: transform .3s var(--fa-ease);
  animation: fa-pop .4s var(--fa-ease);
}
.sticker:hover { transform: rotate(0deg) scale(1.02); }
.label-preview { display: block; width: 100%; max-width: 360px; border-radius: 8px; background: #fff; image-rendering: pixelated; }
@media (min-width: 960px) {
  .sticker-wrap { padding: 16px 8px 8px; }
  .sticker { padding: 12px; }
  .label-preview { max-width: 440px; }
}
</style>
