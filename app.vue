<template>
  <v-app>
    <v-app-bar color="primary" density="comfortable">
      <v-app-bar-title>
        <NuxtLink to="/" class="text-white text-decoration-none">Forray Assist</NuxtLink>
      </v-app-bar-title>
      <ModeToggle class="mr-2" />
      <ConnectivityChip />
      <v-btn icon="mdi-cog" to="/settings" aria-label="Settings" />
    </v-app-bar>
    <v-main>
      <v-container>
        <NuxtPage />
      </v-container>
    </v-main>
  </v-app>
</template>
