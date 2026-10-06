<script setup lang="ts">
const { mode, setMode } = useMode()
const options = [
  { value: 'foray', label: 'Foray', icon: 'mdi-mushroom' },
  { value: 'review', label: 'Review', icon: 'mdi-magnify' },
] as const
function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowLeft') setMode('foray')
  else if (e.key === 'ArrowRight') setMode('review')
}
</script>

<template>
  <div class="fa-seg" role="radiogroup" aria-label="Mode" @keydown="onKey">
    <span class="fa-seg__thumb" :class="{ 'is-review': mode === 'review' }" aria-hidden="true" />
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      role="radio"
      :aria-checked="mode === o.value"
      :tabindex="mode === o.value ? 0 : -1"
      class="fa-seg__btn"
      :class="{ 'is-active': mode === o.value }"
      @click="setMode(o.value)"
    >
      <v-icon :icon="o.icon" size="18" class="fa-seg__icon" />
      <span>{{ o.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.fa-seg {
  position: relative;
  display: inline-grid;
  grid-template-columns: 1fr 1fr;
  padding: 4px;
  border-radius: 999px;
  background: rgba(var(--v-theme-surface), 0.92);
  box-shadow: var(--fa-shadow);
  color: rgba(var(--v-theme-on-surface), 0.7);
}
.fa-seg__thumb {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 4px;
  width: calc(50% - 4px);
  border-radius: 999px;
  background: rgb(var(--v-theme-primary));
  box-shadow: 0 4px 12px rgba(var(--v-theme-primary), 0.4);
  transition: transform 0.35s cubic-bezier(0.34, 1.4, 0.64, 1);
}
.fa-seg__thumb.is-review { transform: translateX(100%); }
.fa-seg__btn {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 40px;
  padding: 0 16px;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  border-radius: 999px;
  transition: color 0.25s;
}
.fa-seg__btn.is-active { color: rgb(var(--v-theme-on-primary)); }
.fa-seg__btn.is-active .fa-seg__icon { animation: fa-seg-wiggle 0.5s var(--fa-ease); }
.fa-seg__btn:focus-visible { outline: 2px solid rgb(var(--v-theme-accent)); outline-offset: 2px; }
@keyframes fa-seg-wiggle {
  0% { transform: scale(0.6) rotate(-20deg); }
  60% { transform: scale(1.2) rotate(8deg); }
  100% { transform: none; }
}
</style>
