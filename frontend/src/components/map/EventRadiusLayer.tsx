import { ScatterplotLayer } from '@deck.gl/layers'
import type { IntelEvent } from '@/types/intelligence'

export function createEventRadiusLayer(event: IntelEvent | null) {
  if (!event) return []
  const perimeter = event.evacuation
    ? [
        new ScatterplotLayer({
          id: 'intel-evacuation-perimeter',
          data: [event],
          getPosition: (d) => [d.centerLongitude, d.centerLatitude],
          getRadius: (d) => d.radiusKm * 1150,
          radiusUnits: 'meters',
          filled: false,
          stroked: true,
          getLineColor: [255, 170, 60, 150],
          getLineWidth: (d) => d.radiusKm * 450,
          lineWidthUnits: 'meters',
          lineWidthMinPixels: 6,
          parameters: { depthTest: false },
        }),
      ]
    : []
  return [
    ...perimeter,
    new ScatterplotLayer({
      id: 'intel-event-radius',
      data: [event],
      getPosition: (d) => [d.centerLongitude, d.centerLatitude],
      getRadius: (d) => d.radiusKm * 1000,
      radiusUnits: 'meters',
      filled: true,
      stroked: true,
      getFillColor: [255, 77, 94, 42],
      getLineColor: [255, 120, 110, 200],
      lineWidthMinPixels: 2,
      parameters: { depthTest: false },
    }),
  ]
}
