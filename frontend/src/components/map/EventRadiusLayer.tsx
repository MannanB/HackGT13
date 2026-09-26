import { ScatterplotLayer } from '@deck.gl/layers'
import type { IntelEvent } from '@/types/intelligence'

export function createEventRadiusLayer(event: IntelEvent | null) {
  if (!event) return []
  return [
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
