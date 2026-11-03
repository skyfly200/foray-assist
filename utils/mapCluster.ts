// Groups map pins that would sit on top of each other at the current zoom. Cells are measured in
// screen pixels (Web Mercator, the projection Leaflet uses), so clusters split apart as you zoom in.
import type { MapPoint } from './findMap.ts'

export interface MapCluster {
  lat: number
  lng: number
  points: MapPoint[]
}

const TILE_PX = 256

/** Where a lat/lng sits in the world at a zoom level, in pixels. */
export function worldPixel(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const scale = TILE_PX * 2 ** zoom
  const s = Math.min(0.9999, Math.max(-0.9999, Math.sin((lat * Math.PI) / 180)))
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale,
  }
}

/** Pins in the same cell become one cluster, placed at their average position. A lone pin keeps its own spot. */
export function clusterPoints(points: MapPoint[], zoom: number, cellPx = 48): MapCluster[] {
  const cells = new Map<string, MapPoint[]>()
  for (const p of points) {
    const { x, y } = worldPixel(p.lat, p.lng, zoom)
    const key = `${Math.floor(x / cellPx)}:${Math.floor(y / cellPx)}`
    const cell = cells.get(key)
    if (cell) cell.push(p)
    else cells.set(key, [p])
  }
  return [...cells.values()].map((members) => {
    if (members.length === 1) return { lat: members[0]!.lat, lng: members[0]!.lng, points: members }
    const n = members.length
    return {
      lat: members.reduce((sum, p) => sum + p.lat, 0) / n,
      lng: members.reduce((sum, p) => sum + p.lng, 0) / n,
      points: members,
    }
  })
}
