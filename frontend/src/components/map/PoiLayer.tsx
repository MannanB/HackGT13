import { ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import type { PointOfInterest, PoiCategory } from '@/types/geography'
import type { PoiPressure } from '@/types/simulation'
import { categoryRgb } from '@/utils/categories'
import { formatVisitorRate, MAX_CAPACITY_RGB, MAX_CAPACITY_RING_RGB, SURGE_RGB, type RGBA } from '@/utils/constants'

export function createPoiLayers({
  pois,
  categories,
  pressure,
  maxCapacityIds,
  tracePoiId,
  zoom,
  gain,
}: {
  pois: PointOfInterest[]
  categories: PoiCategory[]
  pressure: PoiPressure[]
  maxCapacityIds: ReadonlySet<string>
  tracePoiId: string | null
  zoom: number
  gain: boolean
}) {
  const visible = pois.filter((poi) => categories.includes(poi.category))
  const added = new Map(pressure.map((item) => [item.poiId, item.addedDemand]))
  const topStressed = new Set(pressure.slice(0, 5).map((item) => item.poiId))
  const stressed = visible.filter((poi) => added.has(poi.id) && !maxCapacityIds.has(poi.id))
  const maxed = visible.filter((poi) => maxCapacityIds.has(poi.id))
  const labeled = new Set([
    ...(tracePoiId ? [tracePoiId] : []),
    ...maxed.map((poi) => poi.id),
    ...pressure.slice(0, zoom >= 12.5 ? 5 : 3).map((item) => item.poiId),
  ])
  const triggers = [pressure, tracePoiId, zoom, [...maxCapacityIds].join('|')]

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
      id: 'hospital-max-halo',
      data: maxed,
      getPosition: (d) => [d.longitude, d.latitude],
      getRadius: 22,
      radiusUnits: 'pixels',
      getFillColor: [...MAX_CAPACITY_RGB, 36],
      getLineColor: [...MAX_CAPACITY_RING_RGB, 230],
      stroked: true,
      lineWidthMinPixels: 2,
      updateTriggers: { getFillColor: triggers, getLineColor: triggers },
    }),
    new ScatterplotLayer<PointOfInterest>({
      id: 'hospital-max-ring',
      data: maxed,
      getPosition: (d) => [d.longitude, d.latitude],
      getRadius: 14,
      radiusUnits: 'pixels',
      filled: false,
      stroked: true,
      getLineColor: [...MAX_CAPACITY_RGB, 240],
      lineWidthMinPixels: 2,
      updateTriggers: { getLineColor: triggers },
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
      getRadius: (d) => (maxCapacityIds.has(d.id) ? 6 : d.id === tracePoiId ? 5 : topStressed.has(d.id) ? 3.5 : 2.5),
      radiusUnits: 'pixels',
      getFillColor: (d): RGBA =>
        maxCapacityIds.has(d.id)
          ? [...MAX_CAPACITY_RGB, 255]
          : [...categoryRgb(d.category), topStressed.has(d.id) || d.id === tracePoiId ? 255 : 190],
      getLineColor: (d): RGBA =>
        maxCapacityIds.has(d.id) ? [...MAX_CAPACITY_RING_RGB, 255] : [5, 7, 11, 220],
      lineWidthMinPixels: 0.75,
      stroked: true,
      pickable: false,
      updateTriggers: { getRadius: triggers, getFillColor: triggers, getLineColor: triggers },
    }),
    new TextLayer<PointOfInterest>({
      id: 'poi-labels',
      data: visible.filter((poi) => labeled.has(poi.id)),
      getPosition: (d) => [d.longitude, d.latitude],
      getText: (d) => {
        if (maxCapacityIds.has(d.id)) return `${d.name}  projected overload`
        const extra = added.get(d.id)
        return extra ? `${d.name}  +${formatVisitorRate(extra)} visitors` : d.name
      },
      getSize: 11,
      getColor: (d) =>
        maxCapacityIds.has(d.id) ? [...MAX_CAPACITY_RING_RGB, 255] : [...categoryRgb(d.category), 255],
      getPixelOffset: [0, 12],
      fontFamily: 'Geist, sans-serif',
      fontWeight: 500,
      fontSettings: { sdf: true },
      outlineWidth: 3,
      outlineColor: [5, 7, 11, 230],
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'top',
      updateTriggers: { getText: triggers, getColor: triggers },
    }),
  ]
}
