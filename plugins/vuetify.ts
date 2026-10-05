import { createVuetify } from 'vuetify'
import 'vuetify/styles'

export default defineNuxtPlugin((nuxtApp) => {
  const vuetify = createVuetify({
    theme: { defaultTheme: 'light' },
  })
  nuxtApp.vueApp.use(vuetify)
})
