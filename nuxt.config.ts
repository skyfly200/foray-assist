import vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'

export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },
  modules: [
    '@nuxtjs/supabase',
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
  // Vercel is auto-detected by Nitro at build time; no preset needed.
})
