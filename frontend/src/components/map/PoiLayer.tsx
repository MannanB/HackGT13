import { ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import { poiVisibleForFilters, type PointOfInterest, type PoiCategory } from '@/types/geography'
import type { PoiPressure } from '@/types/simulation'
import { formatPopulation } from '@/utils/constants'

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
  pressure: PoiPressure[] = [],
) {
  const visible = pois.filter((poi) => poiVisibleForFilters(poi.category, categories))
  const addedById = new Map(pressure.map((item) => [item.poiId, item.addedPopulation]))
  const labeled = new Set(
    pressure.slice(0, 6).map((item) => item.poiId),
  )
  if (selectedPoiId) labeled.add(selectedPoiId)

  const dots = new ScatterplotLayer<PointOfInterest>({
    id: 'pois',
    data: visible,
    getPosition: (d) => [d.longitude, d.latitude],
    getRadius: (d) => {
      const added = addedById.get(d.id) ?? 0
      if (added > 0) return Math.min(22, 9 + Math.log10(added) * 3.2)
      return d.id === selectedPoiId ? 7 : 4.5
    },
    radiusUnits: 'pixels',
    getFillColor: (d) => {
      if ((addedById.get(d.id) ?? 0) > 0) return [255, 176, 64, 245]
      return CATEGORY_COLOR[d.category]
    },
    getLineColor: (d) =>
      (addedById.get(d.id) ?? 0) > 0 ? [255, 90, 40, 255] : [11, 18, 32, 220],
    lineWidthMinPixels: 1,
    stroked: true,
    pickable: true,
    opacity: emphasized ? 1 : 0.9,
    updateTriggers: {
      getRadius: [selectedPoiId, pressure],
      getFillColor: [pressure],
      getLineColor: [pressure],
    },
  })

  const labels = new TextLayer<PointOfInterest>({
    id: 'poi-labels',
    data: visible.filter((poi) => labeled.has(poi.id)),
    getPosition: (d) => [d.longitude, d.latitude],
    getText: (d) => {
      const added = addedById.get(d.id) ?? 0
      if (added > 0) return `${d.name}  +${formatPopulation(added)} regions`
      return d.name
    },
    getSize: 12,
    getColor: (d) => ((addedById.get(d.id) ?? 0) > 0 ? [255, 214, 140, 255] : [232, 238, 245, 230]),
    getPixelOffset: [0, 16],
    fontFamily: 'IBM Plex Sans, sans-serif',
    getTextAnchor: 'middle',
    updateTriggers: {
      getText: [pressure, selectedPoiId],
      getColor: [pressure],
    },
  })

  return [dots, labels]
}
