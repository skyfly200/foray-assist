// CONTRACT for sync status. This is a stub; the sync work replaces the body
// but must keep this return shape so UI code doesn't change.
export function useSync() {
  const online = ref(true)
  const pending = ref(0) // outbox items waiting to sync
  const signedIn = ref(false)
  const syncing = ref(false)
  async function syncNow(): Promise<void> {}
  return { online, pending, signedIn, syncing, syncNow }
}
