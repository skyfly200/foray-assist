<script setup lang="ts">
const route = useRoute()
const { mode, isForay, setMode } = useMode()

const homeActive = computed(() => route.path === '/' || route.path.startsWith('/forays'))
const settingsActive = computed(() => route.path.startsWith('/settings'))
function toggleMode() {
  setMode(isForay.value ? 'review' : 'foray')
}
</script>

<template>
  <aside class="fa-side">
    <NuxtLink to="/" class="fa-side__brand" aria-label="Forray Assist home">
      <span class="fa-side__mark" aria-hidden="true"><v-icon icon="mdi-mushroom" size="22" /></span>
      <span class="fa-side__name">Forray Assist</span>
    </NuxtLink>

    <nav class="fa-side__nav" aria-label="Main">
      <NuxtLink to="/" class="fa-side__item" :class="{ 'is-active': homeActive }" :aria-current="homeActive ? 'page' : undefined">
        <span class="fa-side__pill"><v-icon icon="mdi-pine-tree" size="24" /></span>
        <span class="fa-side__label">Forays</span>
      </NuxtLink>
      <NuxtLink to="/settings" class="fa-side__item" :class="{ 'is-active': settingsActive }" :aria-current="settingsActive ? 'page' : undefined">
        <span class="fa-side__pill"><v-icon icon="mdi-cog-outline" size="24" /></span>
        <span class="fa-side__label">Settings</span>
      </NuxtLink>
    </nav>

    <div class="fa-side__foot">
      <button
        type="button"
        class="fa-side__mode"
        :class="{ 'is-review': !isForay }"
        :aria-label="isForay ? 'Foray mode. Switch to Review mode' : 'Review mode. Switch to Foray mode'"
        @click="toggleMode"
      >
        <span class="fa-side__thumb" aria-hidden="true" />
        <span class="fa-side__seg" :class="{ 'is-on': isForay }" aria-hidden="true">
          <v-icon icon="mdi-mushroom" size="20" /><span class="fa-side__seg-text">Foray</span>
        </span>
        <span class="fa-side__seg" :class="{ 'is-on': !isForay }" aria-hidden="true">
          <v-icon icon="mdi-magnify" size="20" /><span class="fa-side__seg-text">Review</span>
        </span>
      </button>
      <ConnectivityChip class="fa-side__conn" />
    </div>
  </aside>
</template>

<style scoped>
.fa-side {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 1004;
  width: var(--fa-sidebar-w);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  padding: 18px 12px 16px;
  background: rgb(var(--v-theme-surface));
  border-right: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  box-shadow: var(--fa-shadow);
  overflow-x: hidden;
  overflow-y: auto;
}
.fa-side__brand {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 4px; margin-bottom: 14px; text-decoration: none; color: rgb(var(--v-theme-primary));
  border-radius: 14px;
}
.fa-side__brand:focus-visible, .fa-side__item:focus-visible, .fa-side__mode:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 2px;
}
.fa-side__mark {
  flex: none; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 14px; color: #fff;
  background: var(--fa-hero-gradient); box-shadow: 0 4px 10px rgba(27, 138, 90, 0.35);
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.fa-side__brand:hover .fa-side__mark { transform: rotate(-12deg) scale(1.08); }
.fa-side__name { display: none; font-weight: 800; font-size: 1.1rem; letter-spacing: -0.01em; white-space: nowrap; }

.fa-side__nav { display: flex; flex-direction: column; gap: 6px; }
.fa-side__item {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 6px 0; border-radius: 20px; text-decoration: none;
  color: rgba(var(--v-theme-on-surface), 0.66); cursor: pointer; transition: color 0.25s;
}
.fa-side__pill {
  display: grid; place-items: center; width: 56px; height: 32px; border-radius: 999px;
  transition: background 0.3s var(--fa-ease), transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@media (hover: hover) { .fa-side__item:not(.is-active):hover .fa-side__pill { background: rgba(var(--v-theme-on-surface), 0.07); } }
.fa-side__item:active .fa-side__pill { transform: scale(0.92); }
.fa-side__item.is-active { color: rgb(var(--v-theme-primary)); }
.fa-side__item.is-active .fa-side__pill { background: rgba(var(--v-theme-primary), 0.16); animation: fa-side-bounce 0.45s var(--fa-ease); }
.fa-side__label { font-size: 0.72rem; font-weight: 700; line-height: 1; }

.fa-side__foot { margin-top: auto; display: flex; flex-direction: column; align-items: center; gap: 12px; }
.fa-side__mode {
  position: relative; display: grid; grid-template-columns: 1fr; width: 56px; padding: 4px; border: 0;
  border-radius: 999px; font: inherit; cursor: pointer;
  background: rgba(var(--v-theme-on-surface), 0.07); color: rgba(var(--v-theme-on-surface), 0.7);
}
.fa-side__thumb {
  position: absolute; top: 4px; left: 4px; width: calc(100% - 8px); height: 44px; border-radius: 999px;
  background: rgb(var(--v-theme-primary)); box-shadow: 0 4px 12px rgba(var(--v-theme-primary), 0.4);
  transition: transform 0.35s cubic-bezier(0.34, 1.4, 0.64, 1);
}
.fa-side__mode.is-review .fa-side__thumb { transform: translateY(100%); }
.fa-side__seg {
  position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; gap: 8px;
  height: 44px; font-weight: 600; font-size: 0.9rem; transition: color 0.25s;
}
.fa-side__seg.is-on { color: rgb(var(--v-theme-on-primary)); }
.fa-side__seg-text { display: none; }
.fa-side__conn { max-width: 100%; }
/* rail: show only the connectivity icon */
.fa-side :deep(.fa-conn__label) { display: none; }
.fa-side :deep(.fa-conn) { padding: 6px; }

@keyframes fa-side-bounce { 0% { transform: scale(0.8); } 60% { transform: scale(1.1); } 100% { transform: none; } }

@media (min-width: 1280px) {
  .fa-side { padding: 20px 16px 16px; }
  .fa-side__brand { justify-content: flex-start; padding: 4px 6px; }
  .fa-side__name { display: inline; }
  .fa-side__item { flex-direction: row; gap: 4px; padding: 4px; border-radius: 999px; }
  .fa-side__pill { width: 48px; height: 40px; }
  .fa-side__item.is-active { background: rgba(var(--v-theme-primary), 0.12); }
  .fa-side__item.is-active .fa-side__pill { background: transparent; }
  .fa-side__label { font-size: 0.95rem; }
  .fa-side__foot { align-items: stretch; }
  .fa-side__mode { width: 100%; grid-template-columns: 1fr 1fr; }
  .fa-side__thumb { width: calc(50% - 4px); height: calc(100% - 8px); }
  .fa-side__mode.is-review .fa-side__thumb { transform: translateX(100%); }
  .fa-side__seg { height: 40px; }
  .fa-side__seg-text { display: inline; }
  .fa-side__conn { align-self: flex-start; }
  .fa-side :deep(.fa-conn__label) { display: inline; }
  .fa-side :deep(.fa-conn) { padding: 4px 10px; }
}

@media (prefers-reduced-motion: reduce) {
  .fa-side *, .fa-side *::before { animation: none !important; transition: none !important; }
}
</style>
