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
  css: ['@mdi/font/css/materialdesignicons.css', '~/assets/css/theme.css', '~/assets/css/foray.css', '~/assets/css/desktop.css'],
  app: {
    pageTransition: { name: 'page', mode: 'out-in' },
    // @vite-pwa/nuxt emits manifest.webmanifest but does not link it from the page;
    // without this <link> Chrome reports the app as not installable.
    head: {
      title: 'Voucher',
      link: [
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'apple-touch-icon', href: '/pwa-192.png' },
      ],
      meta: [{ name: 'theme-color', content: '#2e7d32' }],
    },
  },
  build: { transpile: ['vuetify'] },
  vite: {
    vue: { template: { transformAssetUrls } },
  },
  supabase: {
    // The browser client is constructed at startup and throws if the URL/key are
    // empty, which would take down the whole offline app. Without env vars we fall
    // back to a placeholder: signedIn stays false and nothing syncs, but every
    // field workflow still works. `syncConfigured` tells the UI which case it is.
    url: process.env.SUPABASE_URL || 'https://placeholder.supabase.co',
    key: process.env.SUPABASE_KEY || 'placeholder-anon-key',
    redirect: false,
  },
  runtimeConfig: {
    public: { syncConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_KEY) },
  },
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Voucher',
      short_name: 'Voucher',
      description: 'Field records for mushroom forays',
      theme_color: '#2e7d32',
      background_color: '#ffffff',
      display: 'standalone',
      start_url: '/',
      icons: [
        { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      // SPA: any navigation (e.g. /forays/<id>) falls back to the cached shell.
      navigateFallback: '/',
      // OAuth providers redirect the browser to /api/*/callback. That is a navigation, so
      // without this the service worker answers it with the SPA shell and the router 404s
      // instead of letting the request reach the server route.
      navigateFallbackDenylist: [/^\/api\//],
      globPatterns: ['**/*.{js,css,html,woff,woff2,ttf,png,svg,ico}'],
      cleanupOutdatedCaches: true,
      // The self-hosted ONNX/WASM speech runtime (~40 MB) is too big to precache; cache it on first use.
      runtimeCaching: [
        // Map tiles: keep the ones you've looked at so the map still draws offline in the woods.
        {
          urlPattern: ({ url }: { url: URL }) => url.hostname === 'tile.openstreetmap.org',
          handler: 'CacheFirst',
          options: {
            cacheName: 'map-tiles',
            expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 30 },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
        {
          urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith('/ort/'),
          handler: 'CacheFirst',
          options: {
            cacheName: 'ort-runtime',
            expiration: { maxEntries: 8 },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
      ],
    },
    client: { installPrompt: true },
    devOptions: { enabled: false },
  },
  // Prerender the SPA shell so `nuxt build` (what Vercel runs) emits index.html;
  // the service worker's navigateFallback needs it in the precache.
  nitro: { prerender: { routes: ['/'] } },
  // Vercel is auto-detected by Nitro at build time; no preset needed.
})
