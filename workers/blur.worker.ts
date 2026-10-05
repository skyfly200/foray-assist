// Blur-scoring worker. In: { id, blob }. Out: { id, score } | { id, error }.
import { scoreBitmap } from '../utils/blur'

const ctx: any = self

ctx.onmessage = async (e: MessageEvent<{ id: string; blob: Blob }>) => {
  const { id, blob } = e.data
  try {
    const bmp = await createImageBitmap(blob)
    try {
      ctx.postMessage({ id, score: scoreBitmap(bmp) })
    } finally {
      bmp.close()
    }
  } catch (err) {
    ctx.postMessage({ id, error: String(err) })
  }
}
