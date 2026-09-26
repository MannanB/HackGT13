import { GeoJsonLayer } from '@deck.gl/layers'
import { impactColor } from '@/utils/constants'
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import type { ResidentialZone } from '@/types/geography'
import type { ZoneImpact } from '@/types/simulation'

interface ZoneProps {
  zone: ResidentialZone
  impact?: ZoneImpact
}

export function createZoneImpactLayer(
  zones: ResidentialZone[],
  impacts: ZoneImpact[],
  selectedZoneId: string | null,
  simulated: boolean,
  onSelectZone: (zoneId: string) => void,
) {
  const impactByZone = new Map(impacts.map((item) => [item.zoneId, item]))
  const collection: FeatureCollection<Polygon | MultiPolygon, ZoneProps> = {
    type: 'FeatureCollection',
    features: zones.map((zone) => ({
      type: 'Feature',
      geometry: zone.geometry,
      properties: { zone, impact: impactByZone.get(zone.id) },
    })),
  }

  return new GeoJsonLayer<ZoneProps>({
    id: 'zone-impacts',
    data: collection,
    filled: true,
    stroked: true,
    getFillColor: (feature) => {
      const impact = feature.properties.impact
      const selected = feature.properties.zone.id === selectedZoneId
      if (!simulated || !impact || impact.delayMinutes < 3) {
        return selected ? [59, 130, 246, 70] : [48, 78, 108, 78]
      }
      const alpha = selected ? 210 : 140 + Math.round(impact.severity * 50)
      return impactColor(impact.delayMinutes, alpha)
    },
    getLineColor: (feature) => {
      if (feature.properties.zone.id === selectedZoneId) return [232, 238, 245, 230]
      return [20, 30, 44, 80]
    },
    getLineWidth: (feature) => (feature.properties.zone.id === selectedZoneId ? 2 : 0.5),
    lineWidthUnits: 'pixels',
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 255, 255, 40],
    onClick: (info) => {
      const zoneId = info.object?.properties.zone.id
      if (zoneId) onSelectZone(zoneId)
    },
    updateTriggers: {
      getFillColor: [simulated, selectedZoneId, impacts],
      getLineColor: [selectedZoneId],
      getLineWidth: [selectedZoneId],
    },
  })
}
