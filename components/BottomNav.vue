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
  <nav class="fa-nav" aria-label="Main">
    <div class="fa-nav__bar">
      <NuxtLink to="/" class="fa-nav__item" :class="{ 'is-active': homeActive }" :aria-current="homeActive ? 'page' : undefined">
        <span class="fa-nav__pill"><v-icon icon="mdi-pine-tree" size="24" /></span>
        <span class="fa-nav__label">Forays</span>
      </NuxtLink>

      <button
        type="button"
        class="fa-nav__item fa-nav__mode"
        :aria-label="isForay ? 'Foray mode. Switch to Review mode' : 'Review mode. Switch to Foray mode'"
        @click="toggleMode"
      >
        <span class="fa-nav__orb">
          <Transition name="fa-nav-swap" mode="out-in">
            <v-icon :key="mode" :icon="isForay ? 'mdi-mushroom' : 'mdi-magnify'" size="28" />
          </Transition>
        </span>
        <span class="fa-nav__label">{{ isForay ? 'Foray' : 'Review' }}</span>
      </button>

      <NuxtLink to="/settings" class="fa-nav__item" :class="{ 'is-active': settingsActive }" :aria-current="settingsActive ? 'page' : undefined">
        <span class="fa-nav__pill"><v-icon icon="mdi-cog-outline" size="24" /></span>
        <span class="fa-nav__label">Settings</span>
      </NuxtLink>
    </div>
  </nav>
</template>

<style scoped>
.fa-nav {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1004;
  display: flex;
  justify-content: center;
  padding: 0 12px calc(8px + env(safe-area-inset-bottom));
  pointer-events: none;
}
.fa-nav__bar {
  pointer-events: auto;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  align-items: end;
  width: 100%;
  max-width: 460px;
  padding: 6px 8px;
  border-radius: 30px;
  background: rgba(var(--v-theme-surface), 0.94);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow: var(--fa-shadow-lift);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}
.fa-nav__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-height: 56px;
  padding: 4px 0;
  border: 0;
  background: none;
  font: inherit;
  color: rgba(var(--v-theme-on-surface), 0.62);
  text-decoration: none;
  cursor: pointer;
  transition: color 0.25s;
}
.fa-nav__item:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 2px; border-radius: 20px; }
.fa-nav__pill {
  display: grid;
  place-items: center;
  width: 54px;
  height: 32px;
  border-radius: 999px;
  transition: background 0.3s var(--fa-ease), transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.fa-nav__item:active .fa-nav__pill { transform: scale(0.9); }
.fa-nav__item.is-active { color: rgb(var(--v-theme-primary)); }
.fa-nav__item.is-active .fa-nav__pill { background: rgba(var(--v-theme-primary), 0.16); animation: fa-nav-bounce 0.45s var(--fa-ease); }
.fa-nav__label { font-size: 0.72rem; font-weight: 700; line-height: 1; }
.fa-nav__mode { color: rgb(var(--v-theme-primary)); }
.fa-nav__orb {
  display: grid;
  place-items: center;
  width: 58px;
  height: 58px;
  margin-top: -26px;
  border-radius: 50%;
  color: #fff;
  background: var(--fa-hero-gradient);
  box-shadow: 0 8px 18px rgba(27, 138, 90, 0.45);
  border: 4px solid rgb(var(--v-theme-surface));
  transition: transform 0.25s var(--fa-ease);
}
.fa-nav__mode:active .fa-nav__orb { transform: scale(0.9); }
.fa-nav-swap-enter-active, .fa-nav-swap-leave-active { transition: transform 0.18s var(--fa-ease), opacity 0.18s; }
.fa-nav-swap-enter-from { transform: scale(0.4) rotate(-40deg); opacity: 0; }
.fa-nav-swap-leave-to { transform: scale(0.4) rotate(40deg); opacity: 0; }
@keyframes fa-nav-bounce { 0% { transform: scale(0.8); } 60% { transform: scale(1.1); } 100% { transform: none; } }
</style>
