import { createVuetify } from 'vuetify'
import 'vuetify/styles'

const light = {
  dark: false,
  colors: {
    primary: '#1B8A5A',
    secondary: '#F2A33A',
    accent: '#74AC00',
    info: '#2F8FBF',
    success: '#2E9E5B',
    warning: '#E8923B',
    error: '#D93025',
    background: '#F3F8EF',
    surface: '#FFFFFF',
  },
}
const dark = {
  dark: true,
  colors: {
    primary: '#3FBF86',
    secondary: '#F2B35A',
    accent: '#9CCF2E',
    background: '#0F1A14',
    surface: '#17261E',
  },
}

export default defineNuxtPlugin((nuxtApp) => {
  const vuetify = createVuetify({
    theme: { defaultTheme: 'system', themes: { light, dark } },
    defaults: {
      VBtn: { rounded: 'pill', style: 'text-transform: none; letter-spacing: 0; font-weight: 600;' },
      VCard: { rounded: 'xl' },
      VTextField: { variant: 'solo-filled', rounded: 'lg', flat: true },
      VTextarea: { variant: 'solo-filled', rounded: 'lg', flat: true },
      VSelect: { variant: 'solo-filled', rounded: 'lg', flat: true },
      VChip: { rounded: 'pill' },
      VAlert: { rounded: 'lg' },
    },
  })
  nuxtApp.vueApp.use(vuetify)
})
