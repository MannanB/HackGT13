import { GeoJsonLayer } from '@deck.gl/layers'
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import type { ResidentialZone } from '@/types/geography'
import type { ZoneImpact } from '@/types/simulation'
import { delayRgb, gainRgb, type RGBA } from '@/utils/constants'

export interface ZoneProps {
  zone: ResidentialZone
  impact?: ZoneImpact
  shade?: 'delay' | 'gain'
}

export type ZoneFeature = Feature<Polygon | MultiPolygon, ZoneProps>

export function zoneCollection(
  zones: ResidentialZone[],
  delayImpacts: ZoneImpact[],
  gainImpacts: ZoneImpact[] = [],
): FeatureCollection<Polygon | MultiPolygon, ZoneProps> {
  const delayed = new Map(delayImpacts.map((impact) => [impact.zoneId, impact]))
  const gained = new Map(gainImpacts.map((impact) => [impact.zoneId, impact]))
  return {
    type: 'FeatureCollection',
    features: zones.map((zone) => {
      const gainImpact = gained.get(zone.id)
      const delayImpact = delayed.get(zone.id)
      return {
        type: 'Feature' as const,
        geometry: zone.geometry,
        properties: {
          zone,
          impact: gainImpact ?? delayImpact,
          shade: gainImpact ? 'gain' : delayImpact ? 'delay' : undefined,
        },
      }
    }),
  }
}

export function createZoneImpactLayer({
  data,
  selectedZoneId,
  hoveredZoneId,
  delayRange,
  extruded,
}: {
  data: FeatureCollection<Polygon | MultiPolygon, ZoneProps>
  selectedZoneId: string | null
  hoveredZoneId: string | null
  delayRange: [number, number] | null
  extruded: boolean
}) {
  const delayOf = (feature: ZoneFeature) => feature.properties.impact?.delayMinutes ?? 0
  const inRange = (feature: ZoneFeature, delay: number) => {
    if (feature.properties.shade === 'gain') return true
    return !delayRange || (delay >= delayRange[0] && delay < delayRange[1])
  }
  const impactKey = data.features
    .map((feature) => `${feature.properties.shade ?? ''}:${delayOf(feature)}`)
    .join(',')

  return new GeoJsonLayer<ZoneProps>({
    id: 'zone-impacts',
    data: data as never,
    filled: true,
    stroked: !extruded,
    extruded,
    wireframe: false,
    material: { ambient: 0.55, diffuse: 0.6, shininess: 24, specularColor: [60, 60, 70] },
    getElevation: (feature) => delayOf(feature as ZoneFeature) * 45,
    getFillColor: (feature): RGBA => {
      const item = feature as ZoneFeature
      const delay = delayOf(item)
      const id = item.properties.zone.id
      const gain = item.properties.shade === 'gain'
      if (delay <= 0) {
        return id === selectedZoneId ? [124, 196, 255, 60] : [48, 78, 108, 40]
      }
      const [r, g, b] = gain ? gainRgb(delay) : delayRgb(delay)
      const focused = id === selectedZoneId || id === hoveredZoneId
      const severity = Math.min(1, delay / (gain ? 20 : 45))
      const paleYellow = !gain && delay > 0 && delay < 5
      const alpha = !inRange(item, delay)
        ? paleYellow
          ? 10
          : 22
        : paleYellow
          ? focused
            ? 88
            : extruded
              ? 72
              : 32
          : focused
            ? 225
            : extruded
              ? 230
              : (gain ? 190 : 130) + Math.round(severity * 50)
      return [r, g, b, alpha]
    },
    getLineColor: (feature): RGBA => {
      const id = feature.properties.zone.id
      if (id === selectedZoneId) return [255, 255, 255, 255]
      if (id === hoveredZoneId) return [255, 255, 255, 170]
      return [0, 0, 0, 0]
    },
    getLineWidth: (feature) => {
      const id = feature.properties.zone.id
      if (id === selectedZoneId) return 2.5
      if (id === hoveredZoneId) return 1.5
      return 0.5
    },
    lineWidthUnits: 'pixels',
    pickable: true,
    transitions: {
      getFillColor: 450,
      getElevation: { duration: 700, easing: (t: number) => 1 - (1 - t) ** 3 },
    },
    updateTriggers: {
      getFillColor: [selectedZoneId, hoveredZoneId, delayRange, extruded, impactKey],
      getElevation: [extruded, impactKey],
      getLineColor: [selectedZoneId, hoveredZoneId],
      getLineWidth: [selectedZoneId, hoveredZoneId],
    },
  })
}
