<script setup lang="ts">
// The emailed sign-in link lands here. The Supabase client finishes the sign-in from the
// URL on startup; this page waits for that, then routes (welcome for first-timers).
const route = useRoute()
const failed = ref('')

onMounted(async () => {
  const q = { ...route.query, ...Object.fromEntries(new URLSearchParams(window.location.hash.slice(1))) }
  const urlError = String(q.error_description ?? q.error ?? '')
  let sb: any = null
  try { sb = useSupabaseClient() } catch { failed.value = 'Sign-in isn’t set up in this build.'; return }
  try {
    const { data, error } = await sb.auth.getSession()
    if (data?.session) return afterSignIn(sb)
    failed.value = urlError || error?.message || ''
  } catch (e: any) {
    failed.value = urlError || e?.message || ''
  }
  if (!failed.value) failed.value = 'This sign-in link didn’t work.'
})
</script>

<template>
  <div class="fa-auth">
    <v-card v-if="failed" class="fa-card" flat>
      <v-card-text class="pa-6 text-center">
        <v-avatar color="warning" variant="tonal" size="56" class="mb-3"><v-icon size="30">mdi-link-variant-off</v-icon></v-avatar>
        <h1 class="text-h6 font-weight-bold mb-2">Couldn’t sign you in</h1>
        <p class="text-body-2 text-medium-emphasis mb-1">{{ failed }}</p>
        <p class="text-body-2 text-medium-emphasis mb-4">
          Links only work once, for a short time, and in the browser you asked from. You can enter the 6-digit code
          from the same email instead.
        </p>
        <v-btn color="primary" to="/settings" size="large">Sign in again</v-btn>
        <div class="mt-2"><v-btn variant="text" to="/">Carry on without signing in</v-btn></div>
      </v-card-text>
    </v-card>
    <div v-else class="fa-auth__wait" aria-live="polite">
      <v-progress-circular indeterminate color="primary" size="40" />
      <div class="mt-3 text-medium-emphasis">Signing you in…</div>
    </div>
  </div>
</template>

<style scoped>
.fa-auth { max-width: 460px; margin: 32px auto; }
.fa-auth__wait { display: flex; flex-direction: column; align-items: center; padding: 48px 0; }
</style>
