// Base layers the Map tab can show. Add a layer by adding an entry here: the picker lists them all,
// and anything with offline: false is greyed out without a connection.
import { OFM_STYLE } from './offlineMap.ts'

export interface VectorBaseLayer {
  id: string
  name: string
  icon: string
  kind: 'vector'
  /** MapLibre style JSON URL. */
  style: string
  offline: boolean
  note?: string
}

export interface RasterBaseLayer {
  id: string
  name: string
  icon: string
  kind: 'raster'
  /** Leaflet tile URL template. */
  url: string
  attribution: string
  maxNativeZoom: number
  offline: boolean
  note?: string
}

export type BaseLayer = VectorBaseLayer | RasterBaseLayer

export const BASE_LAYERS: BaseLayer[] = [
  {
    id: 'streets',
    name: 'Map',
    icon: 'mdi-map-outline',
    kind: 'vector',
    style: OFM_STYLE,
    offline: true,
    note: 'Roads, trails and places. Saved areas work offline.',
  },
  {
    id: 'satellite',
    name: 'Satellite',
    icon: 'mdi-satellite-variant',
    kind: 'raster',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    maxNativeZoom: 18,
    offline: false,
    note: 'Aerial photos. Needs internet.',
  },
  {
    id: 'terrain',
    name: 'Terrain',
    icon: 'mdi-terrain',
    kind: 'raster',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, SRTM | Style &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
    maxNativeZoom: 17,
    offline: false,
    note: 'Contour lines and hillshade. Needs internet.',
  },
]

export const DEFAULT_LAYER = 'streets'

export function baseLayer(id: string | null | undefined): BaseLayer {
  return BASE_LAYERS.find((l) => l.id === id) ?? BASE_LAYERS[0]!
}
