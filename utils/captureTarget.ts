// Which foray a find from the bottom-bar "New find" button goes into.
// The foray on screen wins. Old photos (picked from the gallery) go to the foray they were taken during,
// else null so a past foray is started for them. Otherwise the newest foray still in progress; else null.
export interface CaptureForay {
  id: string
  startedAt: string
  endedAt?: string
}

/** Slack around a foray's start and end when matching an old photo to it. */
const WINDOW_SLACK_MS = 60 * 60_000

export function pickCaptureForay(
  forays: CaptureForay[],
  currentId?: string | null,
  oldPhotoAt?: string | null,
  now = Date.now(),
): string | null {
  if (currentId && forays.some((f) => f.id === currentId)) return currentId
  if (oldPhotoAt) {
    const t = Date.parse(oldPhotoAt)
    let hit: CaptureForay | null = null
    for (const f of forays) {
      const from = Date.parse(f.startedAt) - WINDOW_SLACK_MS
      const to = (f.endedAt ? Date.parse(f.endedAt) : now) + WINDOW_SLACK_MS
      if (t >= from && t <= to && (!hit || f.startedAt > hit.startedAt)) hit = f
    }
    return hit?.id ?? null
  }
  let best: CaptureForay | null = null
  for (const f of forays) {
    if (f.endedAt) continue
    if (!best || f.startedAt > best.startedAt) best = f
  }
  return best?.id ?? null
}
