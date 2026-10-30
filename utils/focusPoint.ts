/**
 * Maps a tap on an object-fit: cover <video> to a point in the video frame, 0..1 on each
 * axis, the way MediaStreamTrack pointsOfInterest expects. Pure.
 *
 * `tap` and `box` are in CSS pixels, relative to the video's top-left corner. `frame` is the
 * video's intrinsic size. Cover scales the frame up to fill the box and crops the overflow
 * equally on both sides, so that crop is added back before dividing.
 */
export function focusPoint(
  tap: { x: number; y: number },
  box: { width: number; height: number },
  frame: { width: number; height: number },
): { x: number; y: number } {
  const scale = Math.max(box.width / frame.width, box.height / frame.height)
  const shownW = frame.width * scale
  const shownH = frame.height * scale
  const cropX = (shownW - box.width) / 2
  const cropY = (shownH - box.height) / 2
  const clamp = (n: number) => Math.min(1, Math.max(0, n))
  return {
    x: clamp((tap.x + cropX) / shownW),
    y: clamp((tap.y + cropY) / shownH),
  }
}
