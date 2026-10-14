// The user's field-form setup (hidden fields, added fields, forms per printed page), stored in
// settings under 'fieldForm' and shared by every component through one reactive ref.
import { ref } from 'vue'
import { DEFAULT_FORM_CONFIG, FORM_CONFIG_KEY, normalizeFormConfig, type FormConfig } from '~/utils/fieldForm'

const config = ref<FormConfig>({ ...DEFAULT_FORM_CONFIG })
let loading: Promise<void> | null = null

export function useFormConfig() {
  if (!loading) {
    loading = (async () => {
      try { config.value = normalizeFormConfig((await useDb().settings.get(FORM_CONFIG_KEY))?.value) } catch { /* keep defaults */ }
    })()
  }
  async function save(patch: Partial<FormConfig>) {
    config.value = normalizeFormConfig({ ...config.value, ...patch })
    try { await useDb().settings.put({ key: FORM_CONFIG_KEY, value: JSON.parse(JSON.stringify(config.value)) }) } catch { /* ignore */ }
  }
  return { config, ready: loading, save }
}
