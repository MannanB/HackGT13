import { categoryWeight } from '@/utils/categoryWeights'
import { walkMinutes } from '@/utils/geo'
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

type NearestFinder = (key: object, point: LatLng) => Station | null

function nearestFinder(stations: Station[], unboardable: Set<string>): NearestFinder {
  const cache = new Map<object, Station | null>()
  return (key, point) => {
    if (!cache.has(key)) cache.set(key, nearestStation(point, stations, unboardable))
    return cache.get(key) ?? null
  }
}

function optimalTrip(
  zone: ResidentialZone,
  poi: PointOfInterest,
  nearest: NearestFinder,
  graph: RailGraph,
  blocked: Set<string>,
): Trip {
  const direct = walkMinutes(zone.centroid, poiPoint(poi))
  const board = nearest(zone, zone.centroid)
  const alight = nearest(poi, poiPoint(poi))
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
  nearest: NearestFinder,
  graph: RailGraph,
  blocked: Set<string>,
): Map<PoiCategory, Trip> {
  const chosen = new Map<PoiCategory, Trip>()
  for (const [category, pois] of grouped) {
    let best: Trip | null = null
    for (const poi of pois) {
      const trip = optimalTrip(zone, poi, nearest, graph, blocked)
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
  graph: RailGraph
  nearest: NearestFinder
}

let baselineCache: Baseline | null = null

function baselineKey(request: SimulateScenarioRequest): string {
  const categories = [...request.serviceCategories].sort().join(',')
  const zones = request.zones.map((zone) => zone.id).join(',')
  const pois = request.pois.map((poi) => `${poi.id}:${poi.category}`).join(',')
  return `${categories}|${zones}|${pois}|${request.stations.length}|${request.transitEdges.length}`
}

function groupByCategory(pois: PointOfInterest[], categories: PoiCategory[]) {
  const grouped = new Map<PoiCategory, PointOfInterest[]>()
  for (const poi of pois) {
    if (!categories.includes(poi.category)) continue
    const list = grouped.get(poi.category) ?? []
    list.push(poi)
    grouped.set(poi.category, list)
  }
  return grouped
}

function baseline(
  request: SimulateScenarioRequest,
  grouped: Map<PoiCategory, PointOfInterest[]>,
): Baseline {
  const key = baselineKey(request)
  if (baselineCache?.key === key) return baselineCache
  const graph = buildGraph(request.stations, request.transitEdges, new Set())
  const nearest = nearestFinder(request.stations, new Set())
  const beforeByZone = new Map<string, Map<PoiCategory, Trip>>()
  for (const zone of request.zones) {
    beforeByZone.set(zone.id, bestByCategory(zone, grouped, nearest, graph, new Set()))
  }
  baselineCache = { key, beforeByZone, graph, nearest }
  return baselineCache
}

export interface AdditionRequest
  extends Omit<SimulateScenarioRequest, 'maintenanceStations' | 'shutdownStations'> {
  addedPois: PointOfInterest[]
}

/** Mirror of the disruption solve: minutes each area saves when new destinations exist. */
export function buildAdditionSimulation(request: AdditionRequest): SimulationResult {
  const { zones, addedPois } = request
  if (request.stations.length === 0) throw new Error('Station network is not loaded')
  const categories = [...new Set([...request.serviceCategories, ...addedPois.map((poi) => poi.category)])]
  const scoped = { ...request, serviceCategories: categories, maintenanceStations: [], shutdownStations: [] }
  const grouped = groupByCategory(request.pois, categories)
  const { beforeByZone, graph, nearest } = baseline(scoped, grouped)
  const stationById = new Map(request.stations.map((station) => [station.id, station]))

  const impacts: ZoneImpact[] = []
  const traces: Record<string, TraceImpact> = {}
  const gained = new Map<string, number>()

  for (const zone of zones) {
    const before = beforeByZone.get(zone.id)
    if (!before || before.size === 0) continue
    const bestNew = new Map<PoiCategory, Trip>()
    for (const poi of addedPois) {
      if (!before.has(poi.category)) continue
      const trip = optimalTrip(zone, poi, nearest, graph, new Set())
      const current = bestNew.get(poi.category)
      if (!current || trip.minutes < current.minutes) bestNew.set(poi.category, trip)
    }

    let weightSum = 0
    let weightedSaved = 0
    let focus: { before: Trip; after: Trip; score: number } | null = null
    for (const [category, trip] of before) {
      const weight = categoryWeight(request.categoryWeights, category)
      weightSum += weight
      const candidate = bestNew.get(category)
      if (!candidate || candidate.minutes >= trip.minutes) continue
      const saved = trip.minutes - candidate.minutes
      weightedSaved += saved * weight
      gained.set(candidate.poi.id, (gained.get(candidate.poi.id) ?? 0) + 1)
      if (!focus || saved * weight > focus.score) focus = { before: trip, after: candidate, score: saved * weight }
    }
    if (!focus || weightSum === 0) continue
    const savedMinutes = Math.round(weightedSaved / weightSum)
    if (savedMinutes <= 0) continue

    const normalTravelMinutes = Math.round(focus.before.minutes)
    const disruptedTravelMinutes = Math.round(focus.after.minutes)
    impacts.push({
      zoneId: zone.id,
      zoneName: zone.name,
      poiId: focus.after.poi.id,
      poiName: focus.after.poi.name,
      poiCategory: focus.after.poi.category,
      normalTravelMinutes,
      disruptedTravelMinutes,
      delayMinutes: savedMinutes,
      population: zone.population,
    })
    traces[zone.id] = {
      zoneId: zone.id,
      poiId: focus.after.poi.id,
      normalTravelMinutes,
      disruptedTravelMinutes,
      delayMinutes: normalTravelMinutes - disruptedTravelMinutes,
      normalPath: buildPath(zone, focus.before, stationById, new Set()),
      disruptedPath: buildPath(zone, focus.after, stationById, new Set()),
    }
  }

  impacts.sort((a, b) => b.delayMinutes - a.delayMinutes || b.population - a.population)
  const populationAffected = impacts.reduce((sum, impact) => sum + impact.population, 0)
  const weighted = impacts.reduce((sum, impact) => sum + impact.delayMinutes * impact.population, 0)

  return {
    summary: {
      populationAffected,
      averageAddedTravelMinutes: populationAffected ? weighted / populationAffected : 0,
      zonesAffected: impacts.length,
    },
    zoneImpacts: impacts,
    poiPressure: addedPois
      .filter((poi) => gained.has(poi.id))
      .map((poi) => ({
        poiId: poi.id,
        poiName: poi.name,
        category: poi.category,
        baselineRegions: 0,
        disruptedRegions: gained.get(poi.id)!,
        addedRegions: gained.get(poi.id)!,
      }))
      .sort((a, b) => b.addedRegions - a.addedRegions),
    traces,
  }
}

export function buildAccessSimulation(request: SimulateScenarioRequest): SimulationResult {
  const { zones, stations, transitEdges: edges, maintenanceStations, shutdownStations } = request
  const categories = request.serviceCategories
  if (maintenanceStations.length + shutdownStations.length === 0) {
    throw new Error('Set a station to maintenance or shut down')
  }
  if (stations.length === 0) throw new Error('Station network is not loaded')

  const candidates = request.pois.filter((poi) => categories.includes(poi.category))
  if (candidates.length === 0) {
    throw new Error('None of the selected services have destinations on the map')
  }

  const blocked = new Set(shutdownStations)
  const unboardable = new Set([...maintenanceStations, ...shutdownStations])
  const grouped = groupByCategory(candidates, categories)
  const stationById = new Map(stations.map((station) => [station.id, station]))
  const poiById = new Map(candidates.map((poi) => [poi.id, poi]))
  const beforeCount = new Map<string, number>()
  const afterCount = new Map<string, number>()
  const impacts: ZoneImpact[] = []
  const traces: Record<string, TraceImpact> = {}

  const { beforeByZone } = baseline(request, grouped)

  const disruptedGraph = buildGraph(stations, edges, blocked)
  const disruptedNearest = nearestFinder(stations, unboardable)

  for (const zone of zones) {
    const before = beforeByZone.get(zone.id)
    if (!before) continue
    const after = bestByCategory(zone, grouped, disruptedNearest, disruptedGraph, blocked)
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
      poiCategory: afterBest.poi.category,
      normalTravelMinutes,
      disruptedTravelMinutes,
      delayMinutes,
      population: zone.population,
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
      baselineRegions,
      disruptedRegions,
      addedRegions,
    })
  }
  poiPressure.sort((a, b) => {
    const scoreA = a.addedRegions * categoryWeight(request.categoryWeights, a.category)
    const scoreB = b.addedRegions * categoryWeight(request.categoryWeights, b.category)
    return scoreB - scoreA || b.addedRegions - a.addedRegions
  })

  return {
    summary: {
      populationAffected,
      averageAddedTravelMinutes: populationAffected ? weightedDelay / populationAffected : 0,
      zonesAffected: slowed.length,
    },
    zoneImpacts: impacts,
    poiPressure,
    traces,
  }
}
