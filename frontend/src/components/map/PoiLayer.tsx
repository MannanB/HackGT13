import { ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import { poiVisibleForFilters, type PointOfInterest, type PoiCategory } from '@/types/geography'

const CATEGORY_COLOR: Record<PoiCategory, [number, number, number, number]> = {
  hospital: [227, 24, 55, 230],
  clinic: [227, 24, 55, 200],
  grocery: [22, 163, 74, 230],
  pharmacy: [96, 165, 250, 230],
  school: [240, 180, 41, 230],
  university: [240, 180, 41, 200],
  library: [183, 195, 211, 230],
  government: [183, 195, 211, 230],
  employment: [183, 195, 211, 230],
  other: [139, 155, 176, 220],
}

export function createPoiLayers(
  pois: PointOfInterest[],
  categories: PoiCategory[],
  selectedPoiId: string | null,
  emphasized: boolean,
) {
  const visible = pois.filter((poi) => poiVisibleForFilters(poi.category, categories))

  const dots = new ScatterplotLayer<PointOfInterest>({
    id: 'pois',
    data: visible,
    getPosition: (d) => [d.longitude, d.latitude],
    getRadius: (d) => (d.id === selectedPoiId ? 7 : 4.5),
    radiusUnits: 'pixels',
    getFillColor: (d) => CATEGORY_COLOR[d.category],
    getLineColor: [11, 18, 32, 220],
    lineWidthMinPixels: 1,
    stroked: true,
    pickable: true,
    opacity: emphasized ? 1 : 0.8,
  })

  const labels = new TextLayer<PointOfInterest>({
    id: 'poi-labels',
    data: visible.filter((poi) => poi.id === selectedPoiId),
    getPosition: (d) => [d.longitude, d.latitude],
    getText: (d) => d.name,
    getSize: 11,
    getColor: [232, 238, 245, 230],
    getPixelOffset: [0, 14],
    fontFamily: 'IBM Plex Sans, sans-serif',
    getTextAnchor: 'middle',
  })

  return [dots, labels]
}
