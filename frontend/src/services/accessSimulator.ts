import { categoryWeight } from '@/utils/categoryWeights'
import { haversineKm } from '@/utils/geo'
import type { LatLng, PointOfInterest, PoiCategory, ResidentialZone } from '@/types/geography'
import type { Station, TransitEdge } from '@/types/network'
import type {
  PathNode,
  PoiPressure,
  RoutePath,
  SimulateScenarioRequest,
  SimulationResult,
  TraceImpact,
  ZoneImpact,
} from '@/types/simulation'

const WALK_METERS_PER_MINUTE = 80

interface RailGraph {
  ids: string[]
  index: Map<string, number>
  dist: number[][]
  next: number[][]
}

interface Trip {
  minutes: number
  poi: PointOfInterest
  stationIds: string[]
}

function walkMinutes(from: LatLng, to: LatLng): number {
  return (haversineKm(from, to) * 1000) / WALK_METERS_PER_MINUTE
}

function poiPoint(poi: PointOfInterest): LatLng {
  return { latitude: poi.latitude, longitude: poi.longitude }
}

function nearestStation(
  point: LatLng,
  stations: Station[],
  unboardable: Set<string>,
): Station | null {
  let best: Station | null = null
  let bestWalk = Number.POSITIVE_INFINITY
  for (const station of stations) {
    if (unboardable.has(station.id)) continue
    const walk = walkMinutes(point, station)
    if (walk < bestWalk) {
      best = station
      bestWalk = walk
    }
  }
  return best
}

function buildGraph(stations: Station[], edges: TransitEdge[], blocked: Set<string>): RailGraph {
  const ids = stations.filter((station) => !blocked.has(station.id)).map((station) => station.id)
  const index = new Map(ids.map((id, position) => [id, position]))
  const size = ids.length
  const dist = Array.from({ length: size }, () => Array<number>(size).fill(Number.POSITIVE_INFINITY))
  const next = Array.from({ length: size }, () => Array<number>(size).fill(-1))
  for (let i = 0; i < size; i += 1) {
    dist[i][i] = 0
    next[i][i] = i
  }

  const link = (from: string, to: string, minutes: number) => {
    const start = index.get(from)
    const end = index.get(to)
    if (start == null || end == null || minutes >= dist[start][end]) return
    dist[start][end] = minutes
    next[start][end] = end
  }

  for (const edge of edges) {
    link(edge.fromStation, edge.toStation, edge.travelMinutes)
    link(edge.toStation, edge.fromStation, edge.travelMinutes)
  }

  for (let mid = 0; mid < size; mid += 1) {
    for (let start = 0; start < size; start += 1) {
      const startToMid = dist[start][mid]
      if (!Number.isFinite(startToMid)) continue
      for (let end = 0; end < size; end += 1) {
        const through = startToMid + dist[mid][end]
        if (through < dist[start][end]) {
          dist[start][end] = through
          next[start][end] = next[start][mid]
        }
      }
    }
  }

  return { ids, index, dist, next }
}

function railStationIds(graph: RailGraph, fromId: string, toId: string): string[] {
  const start = graph.index.get(fromId)
  const end = graph.index.get(toId)
  if (start == null || end == null || !Number.isFinite(graph.dist[start][end])) return []
  if (fromId === toId) return [fromId]
  const path = [graph.ids[start]]
  let cursor = start
  while (cursor !== end) {
    cursor = graph.next[cursor][end]
    if (cursor < 0) return []
    path.push(graph.ids[cursor])
  }
  return path
}

function optimalTrip(
  zone: ResidentialZone,
  poi: PointOfInterest,
  stations: Station[],
  graph: RailGraph,
  blocked: Set<string>,
  unboardable: Set<string>,
): Trip {
  const direct = walkMinutes(zone.centroid, poiPoint(poi))
  const board = nearestStation(zone.centroid, stations, unboardable)
  const alight = nearestStation(poiPoint(poi), stations, unboardable)
  if (!board || !alight) return { minutes: direct, poi, stationIds: [] }

  const stationIds = railStationIds(graph, board.id, alight.id)
  if (stationIds.length === 0 || stationIds.some((id) => blocked.has(id))) {
    return { minutes: direct, poi, stationIds: [] }
  }

  const ride = graph.dist[graph.index.get(board.id)!][graph.index.get(alight.id)!]
  const transit =
    walkMinutes(zone.centroid, board) + ride + walkMinutes(alight, poiPoint(poi))
  if (transit < direct) return { minutes: transit, poi, stationIds }
  return { minutes: direct, poi, stationIds: [] }
}

function bestByCategory(
  zone: ResidentialZone,
  grouped: Map<PoiCategory, PointOfInterest[]>,
  stations: Station[],
  graph: RailGraph,
  blocked: Set<string>,
  unboardable: Set<string>,
): Map<PoiCategory, Trip> {
  const chosen = new Map<PoiCategory, Trip>()
  for (const [category, pois] of grouped) {
    let best: Trip | null = null
    for (const poi of pois) {
      const trip = optimalTrip(zone, poi, stations, graph, blocked, unboardable)
      if (!best || trip.minutes < best.minutes) best = trip
    }
    if (best) chosen.set(category, best)
  }
  return chosen
}

function stationNode(id: string, stations: Map<string, Station>, blocked: Set<string>): PathNode {
  const station = stations.get(id)
  return {
    type: 'station',
    id,
    name: station?.name ?? id,
    latitude: station?.latitude ?? 0,
    longitude: station?.longitude ?? 0,
    failed: blocked.has(id),
  }
}

function buildPath(
  zone: ResidentialZone,
  trip: Trip,
  stations: Map<string, Station>,
  blocked: Set<string>,
): RoutePath {
  const nodes: PathNode[] = [
    {
      type: 'zone',
      id: zone.id,
      name: zone.name,
      latitude: zone.centroid.latitude,
      longitude: zone.centroid.longitude,
    },
  ]
  for (const stationId of trip.stationIds) {
    nodes.push(stationNode(stationId, stations, blocked))
  }
  nodes.push({
    type: 'poi',
    id: trip.poi.id,
    name: trip.poi.name,
    latitude: trip.poi.latitude,
    longitude: trip.poi.longitude,
  })
  return { nodes, travelMinutes: trip.minutes }
}

interface Baseline {
  key: string
  beforeByZone: Map<string, Map<PoiCategory, Trip>>
}

let baselineCache: Baseline | null = null

function baselineKey(request: SimulateScenarioRequest): string {
  const categories = [...request.serviceCategories].sort().join(',')
  const zones = request.zones?.map((zone) => zone.id).join(',') ?? ''
  const pois = request.pois?.map((poi) => `${poi.id}:${poi.category}`).join(',') ?? ''
  return `${categories}|${zones}|${pois}|${request.stations?.length ?? 0}|${request.transitEdges?.length ?? 0}`
}

function describeDisruptions(
  stations: Map<string, Station>,
  maintenanceStations: string[],
  shutdownStations: string[],
): string {
  const nameOf = (id: string) => stations.get(id)?.name ?? id
  const parts = [
    ...shutdownStations.map((id) => `${nameOf(id)} is shut down, so trains cannot pass through`),
    ...maintenanceStations.map(
      (id) => `${nameOf(id)} is under maintenance, so trains still pass through`,
    ),
  ]
  return `${parts.join('. ')}. Each region keeps the faster of a direct walk or a ride, and can switch to another destination.`
}

export function buildAccessSimulation(request: SimulateScenarioRequest): SimulationResult {
  const zones = request.zones ?? []
  const stations = request.stations ?? []
  const edges = request.transitEdges ?? []
  const categories = request.serviceCategories
  const maintenanceStations = request.maintenanceStations
  const shutdownStations = request.shutdownStations
  if (maintenanceStations.length + shutdownStations.length === 0) {
    throw new Error('Set a station to maintenance or shut down')
  }
  if (stations.length === 0) throw new Error('Station network is not loaded')

  const candidates = (request.pois ?? []).filter((poi) => categories.includes(poi.category))
  if (candidates.length === 0) {
    throw new Error('None of the selected services have destinations on the map')
  }

  const blocked = new Set(shutdownStations)
  const unboardable = new Set([...maintenanceStations, ...shutdownStations])
  const grouped = new Map<PoiCategory, PointOfInterest[]>()
  for (const poi of candidates) {
    const list = grouped.get(poi.category) ?? []
    list.push(poi)
    grouped.set(poi.category, list)
  }
  const stationById = new Map(stations.map((station) => [station.id, station]))
  const poiById = new Map(candidates.map((poi) => [poi.id, poi]))
  const beforeCount = new Map<string, number>()
  const afterCount = new Map<string, number>()
  const impacts: ZoneImpact[] = []
  const traces: Record<string, TraceImpact> = {}

  const key = baselineKey(request)
  let beforeByZone = baselineCache?.key === key ? baselineCache.beforeByZone : null
  if (!beforeByZone) {
    const openGraph = buildGraph(stations, edges, new Set())
    beforeByZone = new Map()
    for (const zone of zones) {
      beforeByZone.set(
        zone.id,
        bestByCategory(zone, grouped, stations, openGraph, new Set(), new Set()),
      )
    }
    baselineCache = { key, beforeByZone }
  }

  const disruptedGraph = buildGraph(stations, edges, blocked)

  for (const zone of zones) {
    const before = beforeByZone.get(zone.id)
    if (!before) continue
    const after = bestByCategory(zone, grouped, stations, disruptedGraph, blocked, unboardable)
    if (before.size === 0 || after.size === 0) continue

    let weightSum = 0
    let weightedDelay = 0
    let focusBaseline: Trip | null = null
    let focusDisrupted: Trip | null = null
    let focusScore = -1
    let focusWeight = -1
    for (const [category, baseline] of before) {
      const disrupted = after.get(category)
      if (!disrupted) continue
      const weight = categoryWeight(request.categoryWeights, category)
      const delay = Math.max(0, disrupted.minutes - baseline.minutes)
      weightSum += weight
      weightedDelay += delay * weight
      beforeCount.set(baseline.poi.id, (beforeCount.get(baseline.poi.id) ?? 0) + 1)
      afterCount.set(disrupted.poi.id, (afterCount.get(disrupted.poi.id) ?? 0) + 1)
      const score = delay * weight
      if (score > focusScore || (score === focusScore && weight > focusWeight)) {
        focusScore = score
        focusWeight = weight
        focusBaseline = baseline
        focusDisrupted = disrupted
      }
    }
    if (!focusBaseline || !focusDisrupted || weightSum === 0) continue

    const beforeBest = focusBaseline
    const afterBest = focusDisrupted
    const normalTravelMinutes = Math.round(beforeBest.minutes)
    const disruptedTravelMinutes = Math.round(afterBest.minutes)
    const delayMinutes = Math.round(weightedDelay / weightSum)
    impacts.push({
      zoneId: zone.id,
      zoneName: zone.name,
      poiId: afterBest.poi.id,
      poiName: afterBest.poi.name,
      normalTravelMinutes,
      disruptedTravelMinutes,
      delayMinutes,
      population: zone.population,
      severity: Math.min(1, delayMinutes / 45),
      lostAccess: false,
    })
    traces[zone.id] = {
      zoneId: zone.id,
      poiId: afterBest.poi.id,
      normalTravelMinutes,
      disruptedTravelMinutes,
      delayMinutes: Math.max(0, disruptedTravelMinutes - normalTravelMinutes),
      normalPath: buildPath(zone, beforeBest, stationById, blocked),
      disruptedPath: buildPath(zone, afterBest, stationById, blocked),
    }
  }

  impacts.sort((a, b) => b.delayMinutes - a.delayMinutes || b.population - a.population)
  const slowed = impacts.filter((impact) => impact.delayMinutes > 0)
  const populationAffected = slowed.reduce((sum, impact) => sum + impact.population, 0)
  const weightedDelay = slowed.reduce(
    (sum, impact) => sum + impact.delayMinutes * impact.population,
    0,
  )

  const poiPressure: PoiPressure[] = []
  for (const [poiId, disruptedRegions] of afterCount) {
    const baselineRegions = beforeCount.get(poiId) ?? 0
    const addedRegions = disruptedRegions - baselineRegions
    const poi = poiById.get(poiId)
    if (!poi || addedRegions <= 0) continue
    poiPressure.push({
      poiId,
      poiName: poi.name,
      category: poi.category,
      baselinePopulation: baselineRegions,
      disruptedPopulation: disruptedRegions,
      addedPopulation: addedRegions,
    })
  }
  poiPressure.sort((a, b) => {
    const scoreA = a.addedPopulation * categoryWeight(request.categoryWeights, a.category)
    const scoreB = b.addedPopulation * categoryWeight(request.categoryWeights, b.category)
    return scoreB - scoreA || b.addedPopulation - a.addedPopulation
  })

  const scenarioKey = [...shutdownStations].sort().join(',') + '|' + [...maintenanceStations].sort().join(',')
  return {
    scenario: {
      id: `ops-${scenarioKey}`,
      createdAt: new Date().toISOString(),
      closedStations: shutdownStations,
      maintenanceStations,
      description: describeDisruptions(stationById, maintenanceStations, shutdownStations),
    },
    summary: {
      populationAffected,
      averageAddedTravelMinutes: populationAffected ? weightedDelay / populationAffected : 0,
      zonesAffected: slowed.length,
      communitiesLosingAccess: slowed.length,
    },
    zoneImpacts: impacts,
    poiPressure,
    failedStations: shutdownStations,
    maintenanceStations,
    reroutedPaths: [],
    traces,
  }
}
