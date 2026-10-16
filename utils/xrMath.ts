// Projection for the AR guide's overlay labels (composables/useXr.ts). Pure, for tests/xrmath.test.mjs.

export interface XrPoint { x: number; y: number; z: number }
export interface ScreenPos { x: number; y: number; visible: boolean }

type Mat = Float32Array | number[]

/** Column-major 4x4 times (x, y, z, 1). */
function mul(m: Mat, p: XrPoint): [number, number, number, number] {
  return [
    m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12],
    m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13],
    m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14],
    m[3] * p.x + m[7] * p.y + m[11] * p.z + m[15],
  ]
}

/** World point to CSS pixels in a width x height overlay. Exported for tests. */
export function project(proj: Mat, view: Mat, p: XrPoint, width: number, height: number): ScreenPos {
  const [vx, vy, vz] = mul(view, p)
  const [cx, cy, , cw] = mul(proj, { x: vx, y: vy, z: vz })
  if (cw <= 0) return { x: 0, y: 0, visible: false }
  const x = ((cx / cw + 1) / 2) * width
  const y = ((1 - cy / cw) / 2) * height
  return { x, y, visible: x > -40 && x < width + 40 && y > -40 && y < height + 40 }
}
