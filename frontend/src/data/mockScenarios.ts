import { mockPois } from '@/data/mockPois'
import { mockStations } from '@/data/mockStations'
import { mockZones } from '@/data/mockZones'
import { haversineKm } from '@/utils/geo'
import type { LatLng, PointOfInterest, PoiCategory, ResidentialZone } from '@/types/geography'
import { poiVisibleForFilters } from '@/types/geography'
import type { Station } from '@/types/network'
import type {
  PathNode,
  RoutePath,
  SimulateScenarioRequest,
  SimulationResult,
  TraceImpact,
  ZoneImpact,
} from '@/types/simulation'

function stationLookup(stations: Station[]) {
  return new Map(stations.map((station) => [station.id, station]))
}

function stationNode(
  id: string,
  stations: Map<string, Station>,
  failed = false,
): PathNode {
  const station = stations.get(id)
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

function nearestStation(point: LatLng, stations: Station[]): Station | undefined {
  if (stations.length === 0) return undefined
  return stations.reduce((best, station) => {
    const bestDist = haversineKm(point, {
      latitude: best.latitude,
      longitude: best.longitude,
    })
    const nextDist = haversineKm(point, {
      latitude: station.latitude,
      longitude: station.longitude,
    })
    return nextDist < bestDist ? station : best
  })
}

function poiMatches(category: PoiCategory, selected: PoiCategory[]): boolean {
  return poiVisibleForFilters(category, selected)
}

function pickPoi(
  categories: PoiCategory[],
  zone: ResidentialZone,
  pois: PointOfInterest[],
): PointOfInterest | undefined {
  const namedGrady = pois.find((poi) => /grady/i.test(poi.name) && poi.category === 'hospital')
  if (namedGrady && /west end/i.test(zone.name) && categories.includes('hospital')) {
    return namedGrady
  }
  const candidates = pois.filter((poi) => poiMatches(poi.category, categories))
  const pool = candidates.length ? candidates : pois
  if (pool.length === 0) return undefined
  return pool.reduce((best, poi) => {
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

function findStationId(stations: Station[], pattern: RegExp): string | undefined {
  return stations.find((station) => pattern.test(station.name))?.id
}

function isHubFailure(station: Station | undefined) {
  return Boolean(station && /five points/i.test(station.name))
}

function isWestEnd(zone: ResidentialZone): boolean {
  return zone.id === 'west-end' || /west end/i.test(zone.name)
}

function namedId(list: Station[], pattern: RegExp, fallback: string) {
  return findStationId(list, pattern) ?? fallback
}

function westEndTrace(
  poi: PointOfInterest,
  zone: ResidentialZone,
  stations: Map<string, Station>,
  list: Station[],
): TraceImpact {
  const westEnd = namedId(list, /west end/i, 'WEST_END')
  const fivePoints = namedId(list, /five points/i, 'FIVE_POINTS')
  const king = namedId(list, /king memorial/i, 'KING_MEMORIAL')
  const georgiaState = namedId(list, /georgia state/i, 'GEORGIA_STATE')
  const normalPath: RoutePath = {
    travelMinutes: 28,
    nodes: [
      zoneNode(zone),
      stationNode(westEnd, stations),
      stationNode(fivePoints, stations, true),
      stationNode(king, stations),
      poiNode(poi),
    ],
  }
  const disruptedPath: RoutePath = {
    travelMinutes: 45,
    nodes: [
      zoneNode(zone),
      stationNode(westEnd, stations),
      stationNode(georgiaState, stations),
      stationNode(king, stations),
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

function buildPaths(
  zone: ResidentialZone,
  poi: PointOfInterest,
  failedId: string,
  stationsList: Station[],
  stations: Map<string, Station>,
): { normalPath: RoutePath; disruptedPath: RoutePath } {
  const hubId = findStationId(stationsList, /five points/i)
  const originId =
    zone.primaryStationId ??
    nearestStation(zone.centroid, stationsList)?.id ??
    hubId ??
    failedId
  const destId =
    poi.nearestStationId ??
    nearestStation(
      { latitude: poi.latitude, longitude: poi.longitude },
      stationsList,
    )?.id ??
    originId

  const normalNodes: PathNode[] = [zoneNode(zone), stationNode(originId, stations)]
  if (hubId && failedId === hubId && originId !== hubId) {
    normalNodes.push(stationNode(hubId, stations, true))
  }
  if (destId !== normalNodes[normalNodes.length - 1]?.id) {
    normalNodes.push(stationNode(destId, stations))
  }
  normalNodes.push(poiNode(poi))

  const disruptedNodes: PathNode[] = [zoneNode(zone)]
  if (originId !== failedId) {
    disruptedNodes.push(stationNode(originId, stations))
  } else if (zone.transferStationIds[0]) {
    disruptedNodes.push(stationNode(zone.transferStationIds[0], stations))
  }
  if (destId !== disruptedNodes[disruptedNodes.length - 1]?.id) {
    disruptedNodes.push(stationNode(destId, stations))
  }
  disruptedNodes.push(poiNode(poi))

  return {
    normalPath: { nodes: normalNodes, travelMinutes: 0 },
    disruptedPath: { nodes: disruptedNodes, travelMinutes: 0 },
  }
}

export function buildMockSimulation(input: SimulateScenarioRequest): SimulationResult {
  const stationsList = input.stations?.length ? input.stations : mockStations
  const zones = input.zones?.length ? input.zones : mockZones
  const pois = input.pois?.length ? input.pois : mockPois
  const stations = stationLookup(stationsList)
  const failedId =
    input.closedStations[0] ?? namedId(stationsList, /five points/i, 'FIVE_POINTS')
  const failedStation = stations.get(failedId)
  const categories = input.serviceCategories.length
    ? input.serviceCategories
    : (['hospital'] as PoiCategory[])

  const zoneImpacts: ZoneImpact[] = []
  const traces: Record<string, TraceImpact> = {}
  const reroutedPaths: RoutePath[] = []

  for (const zone of zones) {
    const poi = pickPoi(categories, zone, pois)
    if (!poi) continue
    const dist = failedStation
      ? haversineKm(zone.centroid, {
          latitude: failedStation.latitude,
          longitude: failedStation.longitude,
        })
      : 3
    const westEnd = isWestEnd(zone) && isHubFailure(failedStation)
    const normal = westEnd ? 28 : Math.round(10 + dist * 4.5)
    const delay = westEnd
      ? 17
      : Math.max(0, Math.round(26 - dist * 3.4 + (dist < 1.2 ? 8 : 0)))
    const lost = delay >= 24 || dist < 0.7
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

    const paths = buildPaths(zone, poi, failedId, stationsList, stations)
    const trace: TraceImpact = westEnd
      ? westEndTrace(poi, zone, stations, stationsList)
      : {
          zoneId: zone.id,
          poiId: poi.id,
          normalTravelMinutes: normal,
          disruptedTravelMinutes: disrupted,
          delayMinutes: delay,
          normalPath: { ...paths.normalPath, travelMinutes: normal },
          disruptedPath: {
            ...paths.disruptedPath,
            travelMinutes: disrupted ?? normal + delay,
          },
        }
    traces[zone.id] = trace
    if (delay >= 12 && reroutedPaths.length < 4) {
      reroutedPaths.push(trace.disruptedPath)
    }
  }

  const westEndIds = new Set(zones.filter(isWestEnd).map((zone) => zone.id))
  zoneImpacts.sort((a, b) => {
    if (westEndIds.has(a.zoneId) !== westEndIds.has(b.zoneId)) {
      return westEndIds.has(a.zoneId) ? -1 : 1
    }
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

  return {
    scenario: {
      id: `scenario_${failedId.toLowerCase()}_${Date.now()}`,
      createdAt: new Date().toISOString(),
      closedStations: [failedId],
      description: `${failedStation?.name ?? failedId} station closure`,
    },
    summary: {
      populationAffected,
      averageAddedTravelMinutes,
      zonesAffected: affected.length,
      communitiesLosingAccess: lost.length,
    },
    zoneImpacts,
    failedStations: [failedId],
    reroutedPaths,
    traces,
  }
}
