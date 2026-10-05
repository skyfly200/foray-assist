import vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'

export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },
  // Offline-first: IndexedDB is the source of truth, so render client-side only.
  ssr: false,
  modules: [
    '@nuxtjs/supabase',
    '@vite-pwa/nuxt',
    (_options, nuxt) => {
      nuxt.hooks.hook('vite:extendConfig', (config) => {
        config.plugins!.push(vuetify({ autoImport: true }))
      })
    },
  ],
  css: ['@mdi/font/css/materialdesignicons.css'],
  build: { transpile: ['vuetify'] },
  vite: {
    vue: { template: { transformAssetUrls } },
  },
  supabase: {
    // Reads SUPABASE_URL and SUPABASE_KEY from the environment.
    redirect: false,
  },
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Forray Assist',
      short_name: 'Forray',
      description: 'Offline-first foray field logger',
      theme_color: '#2e7d32',
      background_color: '#ffffff',
      display: 'standalone',
      start_url: '/',
      icons: [
        { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    },
    workbox: {
      // SPA: any navigation (e.g. /forays/<id>) falls back to the cached shell.
      navigateFallback: '/',
      globPatterns: ['**/*.{js,css,html,woff,woff2,ttf,png,svg,ico}'],
      cleanupOutdatedCaches: true,
    },
    client: { installPrompt: true },
    devOptions: { enabled: false },
  },
  // Prerender the SPA shell so `nuxt build` (what Vercel runs) emits index.html;
  // the service worker's navigateFallback needs it in the precache.
  nitro: { prerender: { routes: ['/'] } },
  // Vercel is auto-detected by Nitro at build time; no preset needed.
})
