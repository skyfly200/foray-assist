// Ask the browser not to evict IndexedDB (notes, photo blobs) under storage pressure.
export default defineNuxtPlugin(() => {
  try {
    navigator.storage?.persist?.()
  } catch {
    /* best effort */
  }
})
