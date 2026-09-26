import { ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import type { PointOfInterest, PoiCategory } from '@/types/geography'
import type { PoiPressure } from '@/types/simulation'
import { categoryRgb } from '@/utils/categories'
import { formatCompact, SURGE_RGB, type RGBA } from '@/utils/constants'

export function createPoiLayers({
  pois,
  categories,
  pressure,
  tracePoiId,
  zoom,
  gain,
}: {
  pois: PointOfInterest[]
  categories: PoiCategory[]
  pressure: PoiPressure[]
  tracePoiId: string | null
  zoom: number
  gain: boolean
}) {
  const visible = pois.filter((poi) => categories.includes(poi.category))
  const added = new Map(pressure.map((item) => [item.poiId, item.addedDemand]))
  const topStressed = new Set(pressure.slice(0, 5).map((item) => item.poiId))
  const stressed = visible.filter((poi) => added.has(poi.id))
  const labeled = new Set([
    ...(tracePoiId ? [tracePoiId] : []),
    ...pressure.slice(0, zoom >= 12.5 ? 5 : 3).map((item) => item.poiId),
  ])
  const triggers = [pressure, tracePoiId, zoom]

  return [
    new ScatterplotLayer<PointOfInterest>({
      id: 'poi-pressure-ring',
      data: stressed,
      getPosition: (d) => [d.longitude, d.latitude],
      getRadius: (d) => 6 + Math.min(15, Math.log10(1 + (added.get(d.id) ?? 0)) * 3.2),
      radiusUnits: 'pixels',
      getFillColor: (d) => [...(gain ? categoryRgb(d.category) : SURGE_RGB), 18],
      getLineColor: (d) => [...(gain ? categoryRgb(d.category) : SURGE_RGB), 185],
      stroked: true,
      lineWidthMinPixels: 1.25,
      transitions: { getRadius: 500 },
      updateTriggers: { getRadius: triggers },
    }),
    new ScatterplotLayer<PointOfInterest>({
      id: 'pois-hit',
      data: visible,
      getPosition: (d) => [d.longitude, d.latitude],
      getRadius: 12,
      radiusUnits: 'pixels',
      getFillColor: [0, 0, 0, 0],
      stroked: false,
      pickable: true,
    }),
    new ScatterplotLayer<PointOfInterest>({
      id: 'pois',
      data: visible,
      getPosition: (d) => [d.longitude, d.latitude],
      getRadius: (d) => (d.id === tracePoiId ? 5 : topStressed.has(d.id) ? 3.5 : 2.5),
      radiusUnits: 'pixels',
      getFillColor: (d): RGBA => [...categoryRgb(d.category), topStressed.has(d.id) || d.id === tracePoiId ? 255 : 190],
      getLineColor: [5, 7, 11, 220],
      lineWidthMinPixels: 0.75,
      stroked: true,
      pickable: false,
      updateTriggers: { getRadius: triggers, getFillColor: triggers },
    }),
    new TextLayer<PointOfInterest>({
      id: 'poi-labels',
      data: visible.filter((poi) => labeled.has(poi.id)),
      getPosition: (d) => [d.longitude, d.latitude],
      getText: (d) => {
        const extra = added.get(d.id)
        return extra ? `${d.name}  +${formatCompact(extra)} trips/day` : d.name
      },
      getSize: 11,
      getColor: (d) => [...categoryRgb(d.category), 255],
      getPixelOffset: [0, 12],
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
