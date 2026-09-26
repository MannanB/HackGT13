import { mockPois } from '@/data/mockPois'
import { mockStations } from '@/data/mockStations'
import { mockZones } from '@/data/mockZones'
import { haversineKm } from '@/utils/geo'
import type { PointOfInterest, PoiCategory, ResidentialZone } from '@/types/geography'
import type { Station } from '@/types/network'
import type {
  PathNode,
  RoutePath,
  SimulateScenarioRequest,
  SimulationResult,
  TraceImpact,
  ZoneImpact,
} from '@/types/simulation'

const stationById = new Map(mockStations.map((station) => [station.id, station]))

function stationNode(id: string, failed = false): PathNode {
  const station = stationById.get(id)
  if (!station) {
    return { type: 'station', id, name: id, latitude: 33.75, longitude: -84.39, failed }
  }
  return {
    type: 'station',
    id: station.id,
    name: station.name,
    latitude: station.latitude,
    longitude: station.longitude,
    failed,
  }
}

function zoneNode(zone: ResidentialZone): PathNode {
  return {
    type: 'zone',
    id: zone.id,
    name: zone.name,
    latitude: zone.centroid.latitude,
    longitude: zone.centroid.longitude,
  }
}

function poiNode(poi: PointOfInterest): PathNode {
  return {
    type: 'poi',
    id: poi.id,
    name: poi.name,
    latitude: poi.latitude,
    longitude: poi.longitude,
  }
}

function pickPoi(categories: PoiCategory[], zone: ResidentialZone): PointOfInterest {
  if (zone.id === 'west-end' && categories.includes('hospital')) {
    const grady = mockPois.find((poi) => poi.id === 'grady')
    if (grady) return grady
  }
  const priority: PoiCategory[] = ['hospital', 'grocery', 'pharmacy']
  const enabled = priority.filter((category) => categories.includes(category))
  const target = enabled[0] ?? 'hospital'
  const candidates = mockPois.filter((poi) => poi.category === target)
  return candidates.reduce((best, poi) => {
    const bestDist = haversineKm(zone.centroid, {
      latitude: best.latitude,
      longitude: best.longitude,
    })
    const nextDist = haversineKm(zone.centroid, {
      latitude: poi.latitude,
      longitude: poi.longitude,
    })
    return nextDist < bestDist ? poi : best
  })
}

function dependsOnFailed(zone: ResidentialZone, failedId: string): boolean {
  return (
    zone.primaryStationId === failedId ||
    zone.transferStationIds.includes(failedId) ||
    failedId === 'FIVE_POINTS'
  )
}

function fivePointsOverrides(zoneId: string): {
  normal: number
  delay: number
  lost: boolean
} | null {
  const table: Record<string, { normal: number; delay: number; lost: boolean }> = {
    'west-end': { normal: 28, delay: 17, lost: false },
    mechanicsville: { normal: 22, delay: 24, lost: false },
    'adair-park': { normal: 26, delay: 20, lost: false },
    'east-atlanta': { normal: 32, delay: 15, lost: false },
    downtown: { normal: 9, delay: 31, lost: true },
    'vine-city': { normal: 16, delay: 27, lost: true },
    'capitol-view': { normal: 29, delay: 21, lost: false },
    peoplestown: { normal: 20, delay: 18, lost: false },
    'oakland-city': { normal: 31, delay: 22, lost: true },
    'east-point': { normal: 38, delay: 19, lost: true },
    'grant-park': { normal: 18, delay: 8, lost: false },
    'old-fourth-ward': { normal: 17, delay: 11, lost: false },
    'inman-park': { normal: 21, delay: 6, lost: false },
    'east-lake': { normal: 34, delay: 4, lost: false },
    midtown: { normal: 14, delay: 7, lost: false },
    'virginia-highland': { normal: 19, delay: 5, lost: false },
    'west-midtown': { normal: 24, delay: 9, lost: false },
    'grant-park-east': { normal: 15, delay: 10, lost: false },
  }
  return table[zoneId] ?? null
}

function buildNormalPath(
  zone: ResidentialZone,
  poi: PointOfInterest,
  failedId: string,
): RoutePath {
  const viaHub = dependsOnFailed(zone, failedId) && failedId === 'FIVE_POINTS'
  const nodes: PathNode[] = [zoneNode(zone), stationNode(zone.primaryStationId)]
  if (viaHub && zone.primaryStationId !== 'FIVE_POINTS') {
    if (zone.primaryStationId === 'WEST_END') {
      nodes.push(stationNode('GARNETT'), stationNode('FIVE_POINTS', true))
    } else if (zone.primaryStationId !== failedId) {
      nodes.push(stationNode('FIVE_POINTS', true))
    } else {
      nodes.push(stationNode('FIVE_POINTS', true))
    }
  }
  if (poi.nearestStationId !== nodes[nodes.length - 1]?.id) {
    nodes.push(stationNode(poi.nearestStationId))
  }
  nodes.push(poiNode(poi))
  return { nodes, travelMinutes: 0 }
}

function buildDisruptedPath(
  zone: ResidentialZone,
  poi: PointOfInterest,
  failedId: string,
): RoutePath {
  const nodes: PathNode[] = [zoneNode(zone)]
  if (failedId === 'FIVE_POINTS') {
    if (zone.id === 'west-end') {
      nodes.push(
        stationNode('GEORGIA_STATE'),
        stationNode('KING_MEMORIAL'),
        poiNode(poi),
      )
      return { nodes, travelMinutes: 0 }
    }
    const bypass =
      zone.transferStationIds.find((id) => id !== failedId) ?? poi.nearestStationId
    if (zone.primaryStationId !== failedId) {
      nodes.push(stationNode(zone.primaryStationId))
    }
    if (bypass !== zone.primaryStationId) {
      nodes.push(stationNode(bypass))
    }
    if (poi.nearestStationId !== bypass) {
      nodes.push(stationNode(poi.nearestStationId))
    }
    nodes.push(poiNode(poi))
    return { nodes, travelMinutes: 0 }
  }

  const alternate =
    zone.transferStationIds.find((id) => id !== failedId) ?? poi.nearestStationId
  nodes.push(stationNode(alternate))
  if (poi.nearestStationId !== alternate) {
    nodes.push(stationNode(poi.nearestStationId))
  }
  nodes.push(poiNode(poi))
  return { nodes, travelMinutes: 0 }
}

function westEndTrace(poi: PointOfInterest, zone: ResidentialZone): TraceImpact {
  const normalPath: RoutePath = {
    travelMinutes: 28,
    nodes: [
      zoneNode(zone),
      stationNode('WEST_END'),
      stationNode('FIVE_POINTS', true),
      stationNode('KING_MEMORIAL'),
      poiNode(poi),
    ],
  }
  const disruptedPath: RoutePath = {
    travelMinutes: 45,
    nodes: [
      zoneNode(zone),
      stationNode('WEST_END'),
      stationNode('GEORGIA_STATE'),
      stationNode('KING_MEMORIAL'),
      poiNode(poi),
    ],
  }
  return {
    zoneId: zone.id,
    poiId: poi.id,
    normalTravelMinutes: 28,
    disruptedTravelMinutes: 45,
    delayMinutes: 17,
    normalPath,
    disruptedPath,
  }
}

export function buildMockSimulation(input: SimulateScenarioRequest): SimulationResult {
  const failedId = input.closedStations[0] ?? 'FIVE_POINTS'
  const failedStation = stationById.get(failedId)
  const categories = input.serviceCategories.length
    ? input.serviceCategories
    : (['hospital'] as PoiCategory[])

  const zoneImpacts: ZoneImpact[] = []
  const traces: Record<string, TraceImpact> = {}
  const reroutedPaths: RoutePath[] = []

  for (const zone of mockZones) {
    const poi = pickPoi(categories, zone)
    const override = failedId === 'FIVE_POINTS' ? fivePointsOverrides(zone.id) : null
    const failed = stationById.get(failedId)
    const dist = failed
      ? haversineKm(zone.centroid, { latitude: failed.latitude, longitude: failed.longitude })
      : 3
    const hubPenalty = dependsOnFailed(zone, failedId)
    const normal = override?.normal ?? Math.round(12 + dist * 6 + (hubPenalty ? 4 : 0))
    const delay = override
      ? override.delay
      : hubPenalty
        ? Math.round(8 + Math.max(0, 18 - dist * 3) + (zone.primaryStationId === failedId ? 14 : 0))
        : Math.max(0, Math.round(6 - dist))
    const lost = override?.lost ?? (delay >= 22 || zone.primaryStationId === failedId)
    const disrupted = lost && delay >= 30 ? null : normal + delay

    const impact: ZoneImpact = {
      zoneId: zone.id,
      zoneName: zone.name,
      poiId: poi.id,
      poiName: poi.name,
      normalTravelMinutes: normal,
      disruptedTravelMinutes: disrupted,
      delayMinutes: delay,
      population: zone.population,
      severity: Math.min(1, delay / 40),
      lostAccess: lost,
    }
    zoneImpacts.push(impact)

    const trace: TraceImpact =
      zone.id === 'west-end' && failedId === 'FIVE_POINTS' && poi.category === 'hospital'
        ? westEndTrace(poi, zone)
        : {
            zoneId: zone.id,
            poiId: poi.id,
            normalTravelMinutes: normal,
            disruptedTravelMinutes: disrupted,
            delayMinutes: delay,
            normalPath: {
              ...buildNormalPath(zone, poi, failedId),
              travelMinutes: normal,
            },
            disruptedPath: {
              ...buildDisruptedPath(zone, poi, failedId),
              travelMinutes: disrupted ?? normal + delay,
            },
          }
    traces[zone.id] = trace
    if (delay >= 12) {
      reroutedPaths.push(trace.disruptedPath)
    }
  }

  zoneImpacts.sort((a, b) => {
    if (failedId === 'FIVE_POINTS' && a.zoneId === 'west-end') return -1
    if (failedId === 'FIVE_POINTS' && b.zoneId === 'west-end') return 1
    return b.delayMinutes - a.delayMinutes
  })

  const affected = zoneImpacts.filter((item) => item.delayMinutes >= 5)
  const lost = zoneImpacts.filter((item) => item.lostAccess)
  const populationAffected = affected.reduce((sum, item) => sum + item.population, 0)
  const averageAddedTravelMinutes =
    affected.length === 0
      ? 0
      : Math.round(
          affected.reduce((sum, item) => sum + item.delayMinutes, 0) / affected.length,
        )

  const summary =
    failedId === 'FIVE_POINTS'
      ? {
          populationAffected: 28400,
          averageAddedTravelMinutes: 17,
          zonesAffected: affected.length,
          communitiesLosingAccess: 6,
        }
      : {
          populationAffected,
          averageAddedTravelMinutes,
          zonesAffected: affected.length,
          communitiesLosingAccess: lost.length,
        }

  return {
    scenario: {
      id: `scenario_${failedId.toLowerCase()}_${Date.now()}`,
      createdAt: new Date().toISOString(),
      closedStations: [failedId],
      description: `${failedStation?.name ?? failedId} station closure`,
    },
    summary,
    zoneImpacts,
    failedStations: [failedId],
    reroutedPaths: reroutedPaths.slice(0, 4),
    traces,
  }
}

export function getStation(id: string): Station | undefined {
  return stationById.get(id)
}
