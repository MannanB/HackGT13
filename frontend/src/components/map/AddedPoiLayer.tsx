import { ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import type { PointOfInterest } from '@/types/geography'
import { categoryRgb } from '@/utils/categories'

export const ADDED_POI_LAYER = 'added-pois'

export function createAddedPoiLayers(pois: PointOfInterest[], draggingId: string | null) {
  return [
    new ScatterplotLayer<PointOfInterest>({
      id: `${ADDED_POI_LAYER}-halo`,
      data: pois,
      getPosition: (d) => [d.longitude, d.latitude],
      getRadius: 22,
      radiusUnits: 'pixels',
      getFillColor: (d) => [...categoryRgb(d.category), 45],
      getLineColor: [74, 222, 128, 200],
      stroked: true,
      lineWidthMinPixels: 1.5,
    }),
    new ScatterplotLayer<PointOfInterest>({
      id: ADDED_POI_LAYER,
      data: pois,
      getPosition: (d) => [d.longitude, d.latitude],
      getRadius: (d) => (d.id === draggingId ? 14 : 12),
      radiusUnits: 'pixels',
      getFillColor: (d) => [...categoryRgb(d.category), 255],
      getLineColor: [255, 255, 255, 255],
      stroked: true,
      lineWidthMinPixels: 2.5,
      pickable: true,
      updateTriggers: { getRadius: draggingId },
    }),
    new TextLayer<PointOfInterest>({
      id: `${ADDED_POI_LAYER}-labels`,
      data: pois,
      getPosition: (d) => [d.longitude, d.latitude],
      getText: (d) => d.name,
      getSize: 12,
      getColor: [220, 255, 225, 255],
      getPixelOffset: [0, 20],
      fontFamily: 'Inter, sans-serif',
      fontWeight: 600,
      fontSettings: { sdf: true },
      outlineWidth: 3,
      outlineColor: [5, 7, 11, 230],
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'top',
    }),
  ]
}
