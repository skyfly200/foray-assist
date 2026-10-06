<template>
  <v-app>
    <v-app-bar flat color="transparent" class="fa-topbar" density="comfortable">
      <NuxtLink to="/" class="fa-brand" aria-label="Forray Assist home">
        <span class="fa-brand__mark" aria-hidden="true">
          <v-icon icon="mdi-mushroom" size="20" />
        </span>
        <span class="fa-brand__name">Forray Assist</span>
      </NuxtLink>
      <v-spacer />
      <ConnectivityChip class="mr-3" />
    </v-app-bar>

    <v-main>
      <v-container class="fa-page pa-3 pa-sm-4">
        <NuxtPage />
      </v-container>
    </v-main>

    <BottomNav />
  </v-app>
</template>

<style>
.fa-topbar {
  background: linear-gradient(to bottom, rgba(var(--v-theme-background), 0.95), rgba(var(--v-theme-background), 0.6)) !important;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}
.fa-brand { display: inline-flex; align-items: center; gap: 10px; margin-left: 14px; text-decoration: none; color: rgb(var(--v-theme-primary)); }
.fa-brand__mark {
  display: grid; place-items: center; width: 34px; height: 34px; border-radius: 12px; color: #fff;
  background: var(--fa-hero-gradient); box-shadow: 0 4px 10px rgba(27, 138, 90, 0.35);
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.fa-brand:hover .fa-brand__mark, .fa-brand:active .fa-brand__mark { transform: rotate(-12deg) scale(1.08); }
.fa-brand__name { font-weight: 800; font-size: 1.1rem; letter-spacing: -0.01em; }
</style>
