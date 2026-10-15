// Which foray a find from the bottom-bar "New find" button goes into.
// The foray on screen wins; otherwise the newest foray still in progress; otherwise null (start a new one).
export interface CaptureForay {
  id: string
  startedAt: string
  endedAt?: string
}

export function pickCaptureForay(forays: CaptureForay[], currentId?: string | null): string | null {
  if (currentId && forays.some((f) => f.id === currentId)) return currentId
  let best: CaptureForay | null = null
  for (const f of forays) {
    if (f.endedAt) continue
    if (!best || f.startedAt > best.startedAt) best = f
  }
  return best?.id ?? null
}
