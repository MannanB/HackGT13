import { GeoJsonLayer } from '@deck.gl/layers'
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import type { ResidentialZone } from '@/types/geography'
import type { ZoneImpact } from '@/types/simulation'
import { delayRgb, gainRgb, MIN_ADDITION_GAIN_MINUTES, type RGBA } from '@/utils/constants'

export interface ZoneProps {
  zone: ResidentialZone
  impact?: ZoneImpact
}

export type ZoneFeature = Feature<Polygon | MultiPolygon, ZoneProps>

export function zoneCollection(
  zones: ResidentialZone[],
  impacts: ZoneImpact[],
): FeatureCollection<Polygon | MultiPolygon, ZoneProps> {
  const byZone = new Map(impacts.map((impact) => [impact.zoneId, impact]))
  return {
    type: 'FeatureCollection',
    features: zones.map((zone) => ({
      type: 'Feature',
      geometry: zone.geometry,
      properties: { zone, impact: byZone.get(zone.id) },
    })),
  }
}

export function createZoneImpactLayer({
  data,
  selectedZoneId,
  hoveredZoneId,
  delayRange,
  extruded,
  gain,
  live,
}: {
  data: FeatureCollection<Polygon | MultiPolygon, ZoneProps>
  selectedZoneId: string | null
  hoveredZoneId: string | null
  delayRange: [number, number] | null
  extruded: boolean
  gain: boolean
  live?: boolean
}) {
  const delayOf = (feature: ZoneFeature) => {
    const delay = feature.properties.impact?.delayMinutes ?? 0
    if (gain && delay < MIN_ADDITION_GAIN_MINUTES) return 0
    return delay
  }
  const inRange = (delay: number) =>
    !delayRange || (delay >= delayRange[0] && delay < delayRange[1])

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
      const delay = delayOf(feature as ZoneFeature)
      const id = feature.properties.zone.id
      if (delay <= 0) {
        return id === selectedZoneId ? [124, 196, 255, 60] : [48, 78, 108, 40]
      }
      const [r, g, b] = gain ? gainRgb(delay) : delayRgb(delay)
      const focused = id === selectedZoneId || id === hoveredZoneId
      const severity = Math.min(1, delay / (gain ? 20 : 45))
      const alpha = !inRange(delay) ? 22 : focused ? 225 : extruded ? 230 : (gain ? 165 : 130) + Math.round(severity * 50)
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
    transitions: live
      ? undefined
      : {
          getFillColor: 450,
          getElevation: { duration: 700, easing: (t: number) => 1 - (1 - t) ** 3 },
        },
    updateTriggers: {
      getFillColor: [selectedZoneId, hoveredZoneId, delayRange, extruded, gain, data],
      getElevation: [data, extruded, gain],
      getLineColor: [selectedZoneId, hoveredZoneId],
      getLineWidth: [selectedZoneId, hoveredZoneId],
    },
  })
}
