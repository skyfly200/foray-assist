// Foray / Review mode. Persisted in Dexie settings key 'mode'; shared via useState
// so every component sees the same reactive value.
export type AppMode = 'foray' | 'review'

export function useMode() {
  const mode = useState<AppMode>('app-mode', () => 'foray')
  const loaded = useState('app-mode-loaded', () => false)

  if (import.meta.client && !loaded.value) {
    loaded.value = true
    useDb()
      .settings.get('mode')
      .then((s) => {
        if (s?.value === 'foray' || s?.value === 'review') mode.value = s.value
      })
      .catch(() => {})
  }

  async function setMode(m: AppMode) {
    mode.value = m
    try {
      await useDb().settings.put({ key: 'mode', value: m })
    } catch {
      // keep in-memory value even if storage is unavailable
    }
  }

  const isForay = computed(() => mode.value === 'foray')
  return { mode, isForay, setMode }
}
