import { ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import type { PointOfInterest, PoiCategory } from '@/types/geography'
import type { PoiPressure } from '@/types/simulation'
import { categoryRgb } from '@/utils/categories'
import type { RGBA } from '@/utils/constants'

export function createPoiLayers({
  pois,
  categories,
  pressure,
  tracePoiId,
}: {
  pois: PointOfInterest[]
  categories: PoiCategory[]
  pressure: PoiPressure[]
  tracePoiId: string | null
}) {
  const visible = pois.filter((poi) => categories.includes(poi.category))
  const added = new Map(pressure.map((item) => [item.poiId, item.addedRegions]))
  const topStressed = new Set(pressure.slice(0, 5).map((item) => item.poiId))
  const stressed = visible.filter((poi) => topStressed.has(poi.id))
  const labeled = new Set(tracePoiId ? [tracePoiId] : [])
  const triggers = [pressure, tracePoiId]

  return [
    new ScatterplotLayer<PointOfInterest>({
      id: 'poi-pressure-ring',
      data: stressed,
      getPosition: (d) => [d.longitude, d.latitude],
      getRadius: (d) => 7 + Math.sqrt(added.get(d.id) ?? 0) * 2.4,
      radiusUnits: 'pixels',
      getFillColor: (d) => [...categoryRgb(d.category), 20],
      getLineColor: (d) => [...categoryRgb(d.category), 150],
      stroked: true,
      lineWidthMinPixels: 1.25,
      transitions: { getRadius: 500 },
      updateTriggers: { getRadius: triggers },
    }),
    new ScatterplotLayer<PointOfInterest>({
      id: 'pois',
      data: visible,
      getPosition: (d) => [d.longitude, d.latitude],
      getRadius: (d) => (d.id === tracePoiId ? 6 : topStressed.has(d.id) ? 3.5 : 2),
      radiusUnits: 'pixels',
      getFillColor: (d): RGBA => [...categoryRgb(d.category), topStressed.has(d.id) || d.id === tracePoiId ? 255 : 110],
      getLineColor: [5, 7, 11, 220],
      lineWidthMinPixels: 0.5,
      stroked: true,
      pickable: true,
      updateTriggers: { getRadius: triggers, getFillColor: triggers },
    }),
    new TextLayer<PointOfInterest>({
      id: 'poi-labels',
      data: visible.filter((poi) => labeled.has(poi.id)),
      getPosition: (d) => [d.longitude, d.latitude],
      getText: (d) => {
        const extra = added.get(d.id)
        return extra ? `${d.name}  +${extra}` : d.name
      },
      getSize: 11,
      getColor: (d) => [...categoryRgb(d.category), 255],
      getPixelOffset: [0, 14],
      fontFamily: 'Geist, sans-serif',
      fontWeight: 500,
      fontSettings: { sdf: true },
      outlineWidth: 3,
      outlineColor: [5, 7, 11, 230],
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'top',
      updateTriggers: { getText: triggers },
    }),
  ]
}
