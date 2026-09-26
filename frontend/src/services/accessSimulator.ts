import { categoryWeight } from '@/utils/categoryWeights'
import {
  MIN_ADDITION_GAIN_MINUTES,
  TRANSFER_PENALTY_MINUTES,
} from '@/utils/constants'
import { haversineKm, walkMinutes } from '@/utils/geo'
import {
  DEFAULT_TIME_MINUTE,
  dailyZoneDemand,
  hourlyHospitalAdmissionDemand,
  aggregateZoneDemand,
  hourlyShare,
  hourlyZoneDemand,
} from '@/utils/hourlyDemand'
import type { LatLng, PointOfInterest, PoiCategory, ResidentialZone } from '@/types/geography'
import type { Station, TransitEdge } from '@/types/network'
import type {
  HospitalCapacity,
  PathNode,
  PassengerJourney,
  PoiCriticalStation,
  PoiPressure,
  PoiStationPressure,
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
  edgeByPair: Map<string, TransitEdge>
}

interface Trip {
  minutes: number
  poi: PointOfInterest
  stationIds: string[]
}

const ANCHORED_CATEGORIES = new Set<PoiCategory>(['school', 'university', 'government'])

function isAnchoredCategory(category: PoiCategory) {
  return ANCHORED_CATEGORIES.has(category)
}

function geographicallyClosest(zone: ResidentialZone, pois: PointOfInterest[]): PointOfInterest | null {
  let best: PointOfInterest | null = null
  let bestKm = Number.POSITIVE_INFINITY
  for (const poi of pois) {
    const km = haversineKm(zone.centroid, poiPoint(poi))
    if (!best || km < bestKm || (km === bestKm && poi.id < best.id)) {
      best = poi
      bestKm = km
    }
  }
  return best
}

function poiPoint(poi: PointOfInterest): LatLng {
  return { latitude: poi.latitude, longitude: poi.longitude }
}

function zoneDemand(zone: ResidentialZone, category?: PoiCategory): number {
  return dailyZoneDemand(zone, category)
}

function poiCapacity(poi: PointOfInterest): number | null {
  const capacity = poi.category === 'hospital'
    ? poi.capacity
    : poi.capacity ?? poi.enrollment ?? poi.jobsCount
  return capacity != null && capacity > 0 ? capacity : null
}

function nearestProducer(poi: PointOfInterest, zones: ResidentialZone[]): ResidentialZone | null {
  let producer: ResidentialZone | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const zone of zones) {
    const distance = haversineKm(zone.centroid, poiPoint(poi))
    if (distance >= bestDistance) continue
    producer = zone
    bestDistance = distance
  }
  return producer
}

function poiCohortDemand(
  zone: ResidentialZone,
  poi: PointOfInterest,
  categoryCounts: Map<PoiCategory, number>,
  minuteOfDay: number,
) {
  const facilities = Math.max(1, categoryCounts.get(poi.category) ?? 1)
  return hourlyZoneDemand(zone, poi.category, minuteOfDay) / Math.sqrt(facilities)
}

interface AccessChoice {
  station: Station
  walkingMinutes: number
}

function stationChoices(
  key: ResidentialZone | PointOfInterest,
  point: LatLng,
  stations: Station[],
  unboardable: Set<string>,
): AccessChoice[] {
  const byId = new Map(stations.map((station) => [station.id, station]))
  const linked = (key.stationAccess ?? [])
    .filter((access) => !unboardable.has(access.stationId) && byId.has(access.stationId))
    .map((access) => ({ station: byId.get(access.stationId)!, walkingMinutes: access.walkingMinutes }))
    .sort((a, b) => a.walkingMinutes - b.walkingMinutes)
  if (linked.length > 0) return linked

  const choices: AccessChoice[] = []
  for (const station of stations) {
    if (unboardable.has(station.id)) continue
    choices.push({ station, walkingMinutes: walkMinutes(point, station) })
  }
  return choices.sort((a, b) => a.walkingMinutes - b.walkingMinutes).slice(0, 3)
}

function buildGraph(stations: Station[], edges: TransitEdge[], blocked: Set<string>): RailGraph {
  const ids = stations.filter((station) => !blocked.has(station.id)).map((station) => station.id)
  const index = new Map(ids.map((id, position) => [id, position]))
  const size = ids.length
  const dist = Array.from({ length: size }, () => Array<number>(size).fill(Number.POSITIVE_INFINITY))
  const next = Array.from({ length: size }, () => Array<number>(size).fill(-1))
  const edgeByPair = new Map<string, TransitEdge>()
  for (let i = 0; i < size; i += 1) {
    dist[i][i] = 0
    next[i][i] = i
  }

  const link = (from: string, to: string, edge: TransitEdge) => {
    const start = index.get(from)
    const end = index.get(to)
    if (start == null || end == null || edge.travelMinutes >= dist[start][end]) return
    dist[start][end] = edge.travelMinutes
    next[start][end] = end
    edgeByPair.set(`${from}:${to}`, edge)
  }

  for (const edge of edges) {
    link(edge.fromStation, edge.toStation, edge)
    link(edge.toStation, edge.fromStation, edge)
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

  return { ids, index, dist, next, edgeByPair }
}

function railMinutes(graph: RailGraph, stationIds: string[]): number {
  if (stationIds.length < 2) return Number.POSITIVE_INFINITY
  let minutes = 0
  let previousLine: TransitEdge['line'] | null = null
  for (let index = 1; index < stationIds.length; index += 1) {
    const edge = graph.edgeByPair.get(`${stationIds[index - 1]}:${stationIds[index]}`)
    if (!edge) return Number.POSITIVE_INFINITY
    minutes += edge.travelMinutes
    if (previousLine == null) minutes += edge.frequencyMinutes / 2
    else if (edge.line !== previousLine) {
      minutes += TRANSFER_PENALTY_MINUTES + edge.frequencyMinutes / 2
    }
    previousLine = edge.line
  }
  return minutes
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

type NearestFinder = (
  key: ResidentialZone | PointOfInterest,
  point: LatLng,
) => AccessChoice[]

function nearestFinder(stations: Station[], unboardable: Set<string>): NearestFinder {
  const cache = new Map<object, AccessChoice[]>()
  return (key, point) => {
    if (!cache.has(key)) cache.set(key, stationChoices(key, point, stations, unboardable))
    return cache.get(key) ?? []
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
  const boards = nearest(zone, zone.centroid)
  const alights = nearest(poi, poiPoint(poi))
  let best: Trip = { minutes: direct, poi, stationIds: [] }
  for (const board of boards) {
    for (const alight of alights) {
      const stationIds = railStationIds(graph, board.station.id, alight.station.id)
      if (stationIds.length < 2 || stationIds.some((id) => blocked.has(id))) continue
      const transit = board.walkingMinutes + railMinutes(graph, stationIds) + alight.walkingMinutes
      if (transit < best.minutes) best = { minutes: transit, poi, stationIds }
    }
  }
  return best
}

function bestByCategory(
  zone: ResidentialZone,
  grouped: Map<PoiCategory, PointOfInterest[]>,
  nearest: NearestFinder,
  graph: RailGraph,
  blocked: Set<string>,
  skip?: ReadonlySet<PoiCategory>,
): Map<PoiCategory, Trip> {
  const chosen = new Map<PoiCategory, Trip>()
  for (const [category, pois] of grouped) {
    if (skip?.has(category)) continue
    if (isAnchoredCategory(category)) {
      const assigned = geographicallyClosest(zone, pois)
      if (assigned) chosen.set(category, optimalTrip(zone, assigned, nearest, graph, blocked))
      continue
    }
    let best: Trip | null = null
    for (const poi of pois) {
      const trip = optimalTrip(zone, poi, nearest, graph, blocked)
      if (!best || trip.minutes < best.minutes) best = trip
    }
    if (best) chosen.set(category, best)
  }
  return chosen
}

function rankHospitals(
  zones: ResidentialZone[],
  hospitals: PointOfInterest[],
  nearest: NearestFinder,
  graph: RailGraph,
  blocked: Set<string>,
): Map<string, Trip[]> {
  const ranked = new Map<string, Trip[]>()
  for (const zone of zones) {
    const trips = hospitals
      .map((poi) => optimalTrip(zone, poi, nearest, graph, blocked))
      .sort((a, b) => a.minutes - b.minutes || a.poi.id.localeCompare(b.poi.id))
    if (trips.length > 0) ranked.set(zone.id, trips)
  }
  return ranked
}

function hospitalBeds(hospitals: PointOfInterest[]): Map<string, number> {
  return new Map(
    hospitals.flatMap((hospital) => {
      const beds = hospital.capacity
      return beds != null && beds > 0 ? [[hospital.id, beds] as const] : []
    }),
  )
}

interface HospitalAllocation {
  trip: Trip
  demand: number
  redirected: boolean
}

type HospitalAssignments = Map<string, HospitalAllocation[]>

function assignHospitals(
  zones: ResidentialZone[],
  ranked: Map<string, Trip[]>,
  beforeByZone: Map<string, Map<PoiCategory, Trip>>,
  minuteOfDay: number,
): HospitalAssignments {
  const assigned: HospitalAssignments = new Map()
  for (const zone of zones) {
    const baseline = beforeByZone.get(zone.id)?.get('hospital')
    const trip = ranked.get(zone.id)?.[0]
    const demand = hourlyZoneDemand(zone, 'hospital', minuteOfDay)
    if (!baseline || !trip || demand <= 0) continue
    assigned.set(zone.id, [{ trip, demand, redirected: trip.poi.id !== baseline.poi.id }])
  }
  return assigned
}

function hospitalCapacityReport(
  hospitals: PointOfInterest[],
  beds: Map<string, number>,
  zones: ResidentialZone[],
  ranked: Map<string, Trip[]>,
  beforeByZone: Map<string, Map<PoiCategory, Trip>>,
  minuteOfDay: number,
  failureStartMinute = 0,
  failureElapsedMinutes = minuteOfDay,
): HospitalCapacity[] {
  const baselineOccupied = new Map<string, number>()
  const surgeOccupied = new Map<string, number>()
  for (const hospital of hospitals) {
    const capacity = beds.get(hospital.id)
    const rate = hospital.baselineOccupancyRate
    if (capacity != null && rate != null) baselineOccupied.set(hospital.id, capacity * rate)
  }

  const admissionsForHour = (hour: number) => {
    const incoming = new Map<string, number>()
    for (const zone of zones) {
      const baselineId = beforeByZone.get(zone.id)?.get('hospital')?.poi.id
      const disruptedId = ranked.get(zone.id)?.[0]?.poi.id
      if (!baselineId || !disruptedId || baselineId === disruptedId) continue
      const admissions = hourlyHospitalAdmissionDemand(zone, hour * 60)
      incoming.set(disruptedId, (incoming.get(disruptedId) ?? 0) + admissions)
    }
    return incoming
  }

  const elapsedHours = Math.max(0, Math.min(24, failureElapsedMinutes / 60))
  const fullHours = Math.floor(elapsedHours)
  const startHour = Math.floor((((failureStartMinute % 1440) + 1440) % 1440) / 60)
  for (let offset = 0; offset < fullHours; offset += 1) {
    const incoming = admissionsForHour((startHour + offset) % 24)
    for (const hospital of hospitals) {
      const stayHours = Math.max(1, (hospital.averageLengthOfStayDays ?? 5) * 24)
      const retained = (surgeOccupied.get(hospital.id) ?? 0) * Math.exp(-1 / stayHours)
      surgeOccupied.set(hospital.id, retained + (incoming.get(hospital.id) ?? 0))
    }
  }
  const partialHour = elapsedHours - fullHours
  if (partialHour > 0 && fullHours < 24) {
    const incoming = admissionsForHour((startHour + fullHours) % 24)
    for (const hospital of hospitals) {
      const stayHours = Math.max(1, (hospital.averageLengthOfStayDays ?? 5) * 24)
      const retained = (surgeOccupied.get(hospital.id) ?? 0) * Math.exp(-partialHour / stayHours)
      surgeOccupied.set(hospital.id, retained + (incoming.get(hospital.id) ?? 0) * partialHour)
    }
  }

  const selectedHour = Math.min(23, Math.floor(minuteOfDay / 60))
  const incomingNow = admissionsForHour(selectedHour)
  return hospitals
    .map((poi) => {
      const capacity = beds.get(poi.id) ?? null
      const baselineDemand = baselineOccupied.get(poi.id) ?? null
      const addedDemand = surgeOccupied.get(poi.id) ?? 0
      const demand = capacity == null || baselineDemand == null ? null : baselineDemand + addedDemand
      const loadRatio = capacity == null || demand == null ? null : demand / capacity
      const overflowPatients = capacity == null || demand == null ? 0 : Math.max(0, demand - capacity)
      const incomingAdmissionsPerHour = incomingNow.get(poi.id) ?? 0
      const stayHours = Math.max(1, (poi.averageLengthOfStayDays ?? 5) * 24)
      const netAdmissionsPerHour = incomingAdmissionsPerHour - addedDemand / stayHours
      const projectedFullMinute =
        capacity != null && demand != null && demand < capacity && netAdmissionsPerHour > 1e-9
          ? minuteOfDay + ((capacity - demand) / netAdmissionsPerHour) * 60
          : null
      return {
        poiId: poi.id,
        poiName: poi.name,
        capacity,
        baselineDemand,
        demand,
        loadRatio,
        addedDemand,
        baselineOccupancyRate: poi.baselineOccupancyRate ?? null,
        incomingAdmissionsPerHour,
        overflowPatients,
        projectedFullMinute,
        averageLengthOfStayDays: poi.averageLengthOfStayDays ?? null,
        utilizationReportEnd: poi.utilizationReportEnd ?? null,
        atMaxCapacity: loadRatio != null && loadRatio + 1e-9 >= 1,
      }
    })
    .filter((item) => item.capacity != null || item.addedDemand > 0)
    .sort((a, b) =>
      Number(b.atMaxCapacity) - Number(a.atMaxCapacity) ||
      (b.loadRatio ?? -1) - (a.loadRatio ?? -1),
    )
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
  const zones = request.zones
    .map((zone) => `${zone.id}:${zone.transitCommuters ?? ''}:${zone.noVehicleHouseholds ?? ''}:${zone.stationAccess?.map((item) => `${item.stationId}-${item.walkingMinutes}`).join('.') ?? ''}`)
    .join(',')
  const pois = request.pois
    .map((poi) => `${poi.id}:${poi.category}:${poi.latitude.toFixed(5)}:${poi.longitude.toFixed(5)}:${poi.stationAccess?.map((item) => `${item.stationId}-${item.walkingMinutes}`).join('.') ?? ''}`)
    .join(',')
  const edges = request.transitEdges
    .map((edge) => `${edge.id}:${edge.travelMinutes}:${edge.frequencyMinutes}`)
    .join(',')
  return `${categories}|${zones}|${pois}|${request.stations.length}|${edges}|anchored-geo`
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

function solveAccess(
  request: SimulateScenarioRequest,
  grouped: Map<PoiCategory, PointOfInterest[]>,
): Baseline & { blocked: Set<string> } {
  const blocked = new Set(request.shutdownStations)
  const unboardable = new Set([...request.maintenanceStations, ...request.shutdownStations])
  if (unboardable.size === 0) {
    return { ...baseline(request, grouped), blocked }
  }
  const graph = buildGraph(request.stations, request.transitEdges, blocked)
  const nearest = nearestFinder(request.stations, unboardable)
  const beforeByZone = new Map<string, Map<PoiCategory, Trip>>()
  for (const zone of request.zones) {
    beforeByZone.set(zone.id, bestByCategory(zone, grouped, nearest, graph, blocked))
  }
  return { key: '', beforeByZone, graph, nearest, blocked }
}

export interface CategoryAccess {
  minutes: number
  poiId: string
  poiName: string
}

export function categoryAccessByZone(request: SimulateScenarioRequest) {
  const grouped = groupByCategory(request.pois, request.serviceCategories)
  const { beforeByZone } = solveAccess(request, grouped)
  const slim = new Map<string, Map<PoiCategory, CategoryAccess>>()
  for (const [zoneId, trips] of beforeByZone) {
    const row = new Map<PoiCategory, CategoryAccess>()
    for (const [category, trip] of trips) {
      row.set(category, { minutes: trip.minutes, poiId: trip.poi.id, poiName: trip.poi.name })
    }
    slim.set(zoneId, row)
  }
  return slim
}

/** A small, representative set of normal journeys for the ambient map animation. */
export function buildBaselineJourneys(
  request: Omit<SimulateScenarioRequest, 'maintenanceStations' | 'shutdownStations'>,
): PassengerJourney[] {
  if (request.stations.length === 0 || request.pois.length === 0) return []
  const candidateZones = [...request.zones]
    .sort((a, b) => zoneDemand(b) - zoneDemand(a))
  const scoped: SimulateScenarioRequest = {
    ...request,
    zones: candidateZones,
    maintenanceStations: [],
    shutdownStations: [],
  }
  const grouped = groupByCategory(request.pois, request.serviceCategories)
  const { beforeByZone, graph, nearest } = baseline(scoped, grouped)
  const stationById = new Map(request.stations.map((station) => [station.id, station]))
  const minuteOfDay = request.timeMinute ?? DEFAULT_TIME_MINUTE
  const journeys: PassengerJourney[] = []

  for (const zone of candidateZones) {
    const trips = beforeByZone.get(zone.id)
    if (!trips) continue
    for (const [category, trip] of trips) {
      journeys.push({
        id: `${zone.id}:${category}`,
        path: buildPath(zone, trip, stationById, new Set()),
        estimatedTrips: hourlyZoneDemand(zone, category, minuteOfDay),
        delayMinutes: 0,
      })
    }
  }

  const categoryCounts = new Map(
    [...grouped].map(([category, categoryPois]) => [category, categoryPois.length]),
  )
  for (const poi of request.pois) {
    if (!request.serviceCategories.includes(poi.category)) continue
    const zone = nearestProducer(poi, candidateZones)
    if (!zone) continue
    const trip = optimalTrip(zone, poi, nearest, graph, new Set())
    journeys.push({
      id: `poi:${poi.id}`,
      path: buildPath(zone, trip, stationById, new Set()),
      estimatedTrips: poiCohortDemand(zone, poi, categoryCounts, minuteOfDay),
      delayMinutes: 0,
    })
  }

  return journeys.sort((a, b) => b.estimatedTrips - a.estimatedTrips)
}

export interface AdditionRequest extends SimulateScenarioRequest {
  addedPois: PointOfInterest[]
}

/** Mirror of the disruption solve: minutes each area saves when new destinations exist. */
export function buildAdditionSimulation(request: AdditionRequest): SimulationResult {
  const { zones, addedPois } = request
  const minuteOfDay = request.timeMinute ?? DEFAULT_TIME_MINUTE
  const failureStartMinute = request.failureStartMinute ?? 0
  const failureElapsedMinutes = request.failureElapsedMinutes ?? minuteOfDay
  if (request.stations.length === 0) throw new Error('Station network is not loaded')
  const categories = [...new Set([...request.serviceCategories, ...addedPois.map((poi) => poi.category)])]
  const scoped = { ...request, serviceCategories: categories }
  const grouped = groupByCategory(request.pois, categories)
  const blocked = new Set(request.shutdownStations)
  const unboardable = new Set([...request.maintenanceStations, ...request.shutdownStations])
  const disrupted = unboardable.size > 0
  const cached = disrupted ? null : baseline(scoped, grouped)
  const graph = disrupted
    ? buildGraph(request.stations, request.transitEdges, blocked)
    : cached!.graph
  const nearest = disrupted
    ? nearestFinder(request.stations, unboardable)
    : cached!.nearest
  const beforeByZone = disrupted
    ? new Map(request.zones.map((zone) => [zone.id, bestByCategory(zone, grouped, nearest, graph, blocked)]))
    : cached!.beforeByZone
  const stationById = new Map(request.stations.map((station) => [station.id, station]))

  const impacts: ZoneImpact[] = []
  const traces: Record<string, TraceImpact> = {}
  const gained = new Map<string, number>()
  const gainedDemand = new Map<string, number>()
  const gainedHour = new Map<string, number>()

  for (const zone of zones) {
    const before = beforeByZone.get(zone.id)
    if (!before || before.size === 0) continue
    const bestNew = new Map<PoiCategory, Trip>()
    for (const poi of addedPois) {
      if (!before.has(poi.category)) continue
      if (isAnchoredCategory(poi.category)) {
        const assigned = before.get(poi.category)?.poi
        if (
          assigned &&
          haversineKm(zone.centroid, poiPoint(poi)) >= haversineKm(zone.centroid, poiPoint(assigned))
        ) {
          continue
        }
      }
      const trip = optimalTrip(zone, poi, nearest, graph, blocked)
      const current = bestNew.get(poi.category)
      if (!current || trip.minutes < current.minutes) bestNew.set(poi.category, trip)
    }

    let focus: { before: Trip; after: Trip; score: number } | null = null
    for (const [category, trip] of before) {
      const candidate = bestNew.get(category)
      if (!candidate || candidate.minutes >= trip.minutes) continue
      const activity = hourlyShare(category, minuteOfDay)
      if (activity <= 0) continue
      const saved = trip.minutes - candidate.minutes
      if (saved < MIN_ADDITION_GAIN_MINUTES) continue
      const score = saved * categoryWeight(category) * activity
      if (!focus || score > focus.score) focus = { before: trip, after: candidate, score }
    }
    if (!focus) continue
    const savedMinutes = Math.round(focus.before.minutes - focus.after.minutes)
    if (savedMinutes < MIN_ADDITION_GAIN_MINUTES) continue
    const hourly = hourlyZoneDemand(zone, focus.after.poi.category, minuteOfDay)
    const total = aggregateZoneDemand(zone, focus.after.poi.category, failureStartMinute, failureElapsedMinutes)
    if (total > 0) {
      gained.set(focus.after.poi.id, (gained.get(focus.after.poi.id) ?? 0) + 1)
      gainedDemand.set(focus.after.poi.id, (gainedDemand.get(focus.after.poi.id) ?? 0) + total)
      gainedHour.set(focus.after.poi.id, (gainedHour.get(focus.after.poi.id) ?? 0) + hourly)
    }

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
      estimatedTrips: hourlyZoneDemand(zone, focus.after.poi.category, minuteOfDay),
    })
    traces[zone.id] = {
      zoneId: zone.id,
      poiId: focus.after.poi.id,
      normalTravelMinutes,
      disruptedTravelMinutes,
      delayMinutes: normalTravelMinutes - disruptedTravelMinutes,
      normalPath: buildPath(zone, focus.before, stationById, blocked),
      disruptedPath: buildPath(zone, focus.after, stationById, blocked),
    }
  }

  impacts.sort((a, b) => b.delayMinutes - a.delayMinutes || b.population - a.population)
  const populationAffected = impacts.reduce((sum, impact) => sum + impact.population, 0)
  const visitorsAffected = impacts.reduce((sum, impact) => sum + impact.estimatedTrips, 0)
  const weighted = impacts.reduce((sum, impact) => sum + impact.delayMinutes * impact.estimatedTrips, 0)

  return {
    summary: {
      populationAffected,
      visitorsAffected,
      averageAddedTravelMinutes: visitorsAffected ? weighted / visitorsAffected : 0,
      zonesAffected: impacts.length,
    },
    zoneImpacts: impacts,
    poiPressure: addedPois
      .filter((poi) => gained.has(poi.id))
      .map((poi) => {
        const demand = gainedDemand.get(poi.id) ?? 0
        const hourly = gainedHour.get(poi.id) ?? 0
        const capacity = poiCapacity(poi)
        return {
          poiId: poi.id,
          poiName: poi.name,
          category: poi.category,
          baselineRegions: 0,
          disruptedRegions: gained.get(poi.id)!,
          addedRegions: gained.get(poi.id)!,
          baselineDemand: 0,
          disruptedDemand: hourly,
          addedDemand: demand,
          capacity,
          loadRatio: capacity ? hourly / capacity : null,
        }
      })
      .sort((a, b) => b.addedDemand - a.addedDemand),
    hospitalCapacity: [],
    traces,
  }
}

export interface OptimalSiteResult {
  longitude: number
  latitude: number
  regions: number
  personMinutes: number
}

export function findOptimalAdditionSite(request: {
  category: PoiCategory
  zones: ResidentialZone[]
  pois: PointOfInterest[]
  stations: Station[]
  transitEdges: TransitEdge[]
  serviceCategories: PoiCategory[]
  occupied?: LatLng[]
  maintenanceStations?: string[]
  shutdownStations?: string[]
  underservedLimit?: number
  stationLimit?: number
}): OptimalSiteResult | null {
  const categories = [...new Set([...request.serviceCategories, request.category])]
  const scoped: SimulateScenarioRequest = {
    ...request,
    serviceCategories: categories,
    maintenanceStations: request.maintenanceStations ?? [],
    shutdownStations: request.shutdownStations ?? [],
  }
  const grouped = groupByCategory(request.pois, categories)
  if (!grouped.has(request.category)) {
    grouped.set(
      request.category,
      request.pois.filter((poi) => poi.category === request.category),
    )
  }
  const { beforeByZone, graph, nearest, blocked } = solveAccess(scoped, grouped)

  const underserved = request.zones
    .map((zone) => {
      const trip = beforeByZone.get(zone.id)?.get(request.category)
      return trip ? { zone, minutes: trip.minutes } : null
    })
    .filter((item): item is { zone: ResidentialZone; minutes: number } => item != null)
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, request.underservedLimit ?? 48)

  const stationPoints = request.stations
    .map((station) => ({
      station,
      km: underserved.length
        ? Math.min(
            ...underserved.map((item) =>
              haversineKm(item.zone.centroid, { latitude: station.latitude, longitude: station.longitude }),
            ),
          )
        : 0,
    }))
    .sort((a, b) => a.km - b.km)
    .slice(0, request.stationLimit ?? request.stations.length)
    .map((item) => ({
      latitude: item.station.latitude + 0.0012,
      longitude: item.station.longitude + 0.0012,
    }))

  const candidates: LatLng[] = [
    ...stationPoints,
    ...underserved.map((item) => item.zone.centroid),
  ]
  if (candidates.length === 0) return null

  const occupied = request.occupied ?? []
  const taken = (point: LatLng) => occupied.some((site) => haversineKm(point, site) < 0.45)

  const ranked: { point: LatLng; regions: number; personMinutes: number }[] = []
  let probe = 0
  for (const point of candidates) {
    probe += 1
    const poi: PointOfInterest = {
      id: `opt-${probe}`,
      name: 'opt',
      category: request.category,
      latitude: point.latitude,
      longitude: point.longitude,
    }
    let regions = 0
    let personMinutes = 0
    for (const zone of request.zones) {
      const beforeTrip = beforeByZone.get(zone.id)?.get(request.category)
      const beforeMinutes = beforeTrip?.minutes ?? Number.POSITIVE_INFINITY
      if (isAnchoredCategory(request.category) && beforeTrip) {
        if (haversineKm(zone.centroid, poiPoint(poi)) >= haversineKm(zone.centroid, poiPoint(beforeTrip.poi))) continue
      }
      const trip = optimalTrip(zone, poi, nearest, graph, blocked)
      const saved = beforeMinutes - trip.minutes
      if (saved < MIN_ADDITION_GAIN_MINUTES) continue
      regions += 1
      personMinutes += saved * zoneDemand(zone, request.category)
    }
    ranked.push({ point, regions, personMinutes })
  }

  ranked.sort((a, b) => b.personMinutes - a.personMinutes || b.regions - a.regions)
  const next = ranked.find((item) => item.regions > 0 && !taken(item.point))
    ?? ranked.find((item) => !taken(item.point))
  if (!next) return null
  return {
    longitude: next.point.longitude,
    latitude: next.point.latitude,
    regions: next.regions,
    personMinutes: next.personMinutes,
  }
}

export function buildAccessSimulation(request: SimulateScenarioRequest): SimulationResult {
  const { zones, stations, transitEdges: edges, maintenanceStations, shutdownStations } = request
  const categories = request.serviceCategories
  const minuteOfDay = request.timeMinute ?? DEFAULT_TIME_MINUTE
  const failureStartMinute = request.failureStartMinute ?? 0
  const failureElapsedMinutes = request.failureElapsedMinutes ?? minuteOfDay
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
  const categoryCounts = new Map(
    [...grouped].map(([category, categoryPois]) => [category, categoryPois.length]),
  )
  const stationById = new Map(stations.map((station) => [station.id, station]))
  const poiById = new Map(candidates.map((poi) => [poi.id, poi]))
  const beforeCount = new Map<string, number>()
  const afterCount = new Map<string, number>()
  const beforeDemand = new Map<string, number>()
  const afterDemand = new Map<string, number>()
  const beforeTotal = new Map<string, number>()
  const afterTotal = new Map<string, number>()
  const impacts: ZoneImpact[] = []
  const traces: Record<string, TraceImpact> = {}
  const flowJourneys: PassengerJourney[] = []

  const { beforeByZone } = baseline(request, grouped)

  const disruptedGraph = buildGraph(stations, edges, blocked)
  const disruptedNearest = nearestFinder(stations, unboardable)
  const hospitals = grouped.get('hospital') ?? []
  const hospitalRanks = hospitals.length
    ? rankHospitals(zones, hospitals, disruptedNearest, disruptedGraph, blocked)
    : null
  const hospitalBedsById = hospitalRanks ? hospitalBeds(hospitals) : null
  const hospitalAssignment =
    hospitalRanks && hospitalBedsById
      ? assignHospitals(
          zones,
          hospitalRanks,
          beforeByZone,
          minuteOfDay,
        )
      : null
  const skipHospital = hospitalAssignment ? new Set<PoiCategory>(['hospital']) : undefined

  for (const zone of zones) {
    const before = beforeByZone.get(zone.id)
    if (!before) continue
    const after = bestByCategory(zone, grouped, disruptedNearest, disruptedGraph, blocked, skipHospital)
    const hospitalAllocations = hospitalAssignment?.get(zone.id) ?? []
    if (before.size === 0 || (after.size === 0 && hospitalAllocations.length === 0)) continue

    let weightSum = 0
    let weightedDelay = 0
    let focusBaseline: Trip | null = null
    let focusDisrupted: Trip | null = null
    let focusScore = -1
    let focusWeight = -1
    for (const [category, baseline] of before) {
      if (category === 'hospital' && hospitalAssignment) continue
      const disrupted = after.get(category)
      if (!disrupted) continue
      const demand = hourlyZoneDemand(zone, category, minuteOfDay)
      const total = aggregateZoneDemand(zone, category, failureStartMinute, failureElapsedMinutes)
      const weight = categoryWeight(category) * hourlyShare(category, minuteOfDay)
      if (total > 0) {
        beforeCount.set(baseline.poi.id, (beforeCount.get(baseline.poi.id) ?? 0) + 1)
        afterCount.set(disrupted.poi.id, (afterCount.get(disrupted.poi.id) ?? 0) + 1)
        beforeTotal.set(baseline.poi.id, (beforeTotal.get(baseline.poi.id) ?? 0) + total)
        afterTotal.set(disrupted.poi.id, (afterTotal.get(disrupted.poi.id) ?? 0) + total)
      }
      if (demand <= 0 || weight <= 0) continue
      const delay = Math.max(0, disrupted.minutes - baseline.minutes)
      weightSum += weight
      weightedDelay += delay * weight
      beforeDemand.set(baseline.poi.id, (beforeDemand.get(baseline.poi.id) ?? 0) + demand)
      afterDemand.set(disrupted.poi.id, (afterDemand.get(disrupted.poi.id) ?? 0) + demand)
      flowJourneys.push({
        id: `${zone.id}:${category}`,
        path: buildPath(zone, disrupted, stationById, blocked),
        estimatedTrips: demand,
        delayMinutes: delay,
      })
      const score = delay * weight
      if (score > focusScore || (score === focusScore && weight > focusWeight)) {
        focusScore = score
        focusWeight = weight
        focusBaseline = baseline
        focusDisrupted = disrupted
      }
    }

    const hospitalBaseline = before.get('hospital')
    const hospitalTrip = hospitalRanks?.get(zone.id)?.[0] ?? null
    if (hospitalAssignment && hospitalBaseline && hospitalTrip) {
      const hospitalTotal = aggregateZoneDemand(zone, 'hospital', failureStartMinute, failureElapsedMinutes)
      if (hospitalTotal > 0) {
        beforeCount.set(hospitalBaseline.poi.id, (beforeCount.get(hospitalBaseline.poi.id) ?? 0) + 1)
        afterCount.set(hospitalTrip.poi.id, (afterCount.get(hospitalTrip.poi.id) ?? 0) + 1)
        beforeTotal.set(hospitalBaseline.poi.id, (beforeTotal.get(hospitalBaseline.poi.id) ?? 0) + hospitalTotal)
        afterTotal.set(hospitalTrip.poi.id, (afterTotal.get(hospitalTrip.poi.id) ?? 0) + hospitalTotal)
      }
    }
    if (hospitalBaseline && hospitalAllocations.length > 0) {
      const demand = hospitalAllocations.reduce((sum, allocation) => sum + allocation.demand, 0)
      if (demand > 0) {
        const weight = categoryWeight('hospital') * hourlyShare('hospital', minuteOfDay)
        const averageDelay = hospitalAllocations.reduce(
          (sum, allocation) =>
            sum + Math.max(0, allocation.trip.minutes - hospitalBaseline.minutes) * allocation.demand,
          0,
        ) / demand
        weightSum += weight
        weightedDelay += averageDelay * weight
        beforeDemand.set(
          hospitalBaseline.poi.id,
          (beforeDemand.get(hospitalBaseline.poi.id) ?? 0) + demand,
        )

        for (const allocation of hospitalAllocations) {
          const fraction = allocation.demand / demand
          const disrupted = allocation.trip
          const delay = Math.max(0, disrupted.minutes - hospitalBaseline.minutes)
          afterDemand.set(
            disrupted.poi.id,
            (afterDemand.get(disrupted.poi.id) ?? 0) + allocation.demand,
          )
          flowJourneys.push({
            id: `${zone.id}:hospital:${disrupted.poi.id}`,
            path: buildPath(zone, disrupted, stationById, blocked),
            estimatedTrips: allocation.demand,
            delayMinutes: delay,
          })
          const score = delay * weight * fraction
          if (score > focusScore || (score === focusScore && weight > focusWeight)) {
            focusScore = score
            focusWeight = weight
            focusBaseline = hospitalBaseline
            focusDisrupted = disrupted
          }
        }
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
      estimatedTrips: hourlyZoneDemand(zone, afterBest.poi.category, minuteOfDay),
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


  for (const poi of candidates) {
    const zone = nearestProducer(poi, zones)
    if (!zone) continue
    const trip = optimalTrip(zone, poi, disruptedNearest, disruptedGraph, blocked)
    flowJourneys.push({
      id: `poi:${poi.id}`,
      path: buildPath(zone, trip, stationById, blocked),
      estimatedTrips: poiCohortDemand(zone, poi, categoryCounts, minuteOfDay),
      delayMinutes: 0,
    })
  }

  impacts.sort((a, b) => b.delayMinutes - a.delayMinutes || b.population - a.population)
  const slowed = impacts.filter((impact) => impact.delayMinutes > 0)
  const populationAffected = slowed.reduce((sum, impact) => sum + impact.population, 0)
  const visitorsAffected = slowed.reduce((sum, impact) => sum + impact.estimatedTrips, 0)
  const weightedDelay = slowed.reduce(
    (sum, impact) => sum + impact.delayMinutes * impact.estimatedTrips,
    0,
  )

  const hospitalCapacity =
    hospitalAssignment && hospitalBedsById
      ? hospitalCapacityReport(
          hospitals,
          hospitalBedsById,
          zones,
          hospitalRanks!,
          beforeByZone,
          minuteOfDay,
          failureStartMinute,
          failureElapsedMinutes,
        )
      : []

  const poiPressure: PoiPressure[] = []
  for (const [poiId, disruptedRegions] of afterCount) {
    const baselineRegions = beforeCount.get(poiId) ?? 0
    const addedRegions = disruptedRegions - baselineRegions
    const poi = poiById.get(poiId)
    if (!poi || addedRegions <= 0) continue
    const baselineDemand = beforeDemand.get(poiId) ?? 0
    const disruptedDemand = afterDemand.get(poiId) ?? 0
    const addedDemand = Math.max(0, (afterTotal.get(poiId) ?? 0) - (beforeTotal.get(poiId) ?? 0))
    const modeled = hospitalCapacity.find((item) => item.poiId === poiId)
    const rawCapacity = modeled ? modeled.capacity : poiCapacity(poi)
    const capacity = rawCapacity != null && rawCapacity > 0 ? rawCapacity : null
    poiPressure.push({
      poiId,
      poiName: poi.name,
      category: poi.category,
      baselineRegions,
      disruptedRegions,
      addedRegions,
      baselineDemand,
      disruptedDemand,
      addedDemand,
      capacity,
      loadRatio: modeled ? modeled.loadRatio : capacity ? disruptedDemand / capacity : null,
    })
  }
  poiPressure.sort((a, b) => {
    const scoreA = a.addedDemand * categoryWeight(a.category)
    const scoreB = b.addedDemand * categoryWeight(b.category)
    return scoreB - scoreA || b.addedDemand - a.addedDemand
  })

  return {
    summary: {
      populationAffected,
      visitorsAffected,
      averageAddedTravelMinutes: visitorsAffected ? weightedDelay / visitorsAffected : 0,
      zonesAffected: slowed.length,
    },
    zoneImpacts: impacts,
    poiPressure,
    hospitalCapacity,
    traces,
    flowJourneys,
  }
}

const CRITICAL_LIST_LENGTH = 5

export function createPoiCriticalIndex(request: {
  zones: ResidentialZone[]
  pois: PointOfInterest[]
  stations: Station[]
  transitEdges: TransitEdge[]
}) {
  const { zones, pois, stations, transitEdges: edges } = request
  const grouped = new Map<PoiCategory, PointOfInterest[]>()
  for (const poi of pois) {
    const list = grouped.get(poi.category) ?? []
    list.push(poi)
    grouped.set(poi.category, list)
  }

  const openGraph = buildGraph(stations, edges, new Set())
  const openNearest = nearestFinder(stations, new Set())
  const beforeByZone = new Map<string, Map<PoiCategory, Trip>>()
  for (const zone of zones) {
    beforeByZone.set(zone.id, bestByCategory(zone, grouped, openNearest, openGraph, new Set()))
  }

  const scoresByPoi = new Map<string, PoiStationPressure[]>()

  return {
    stations,
    absorb(station: Station) {
      const blocked = new Set([station.id])
      const graph = buildGraph(stations, edges, blocked)
      const nearest = nearestFinder(stations, blocked)
      const surge = new Map<string, number>()
      const access = new Map<string, number>()

      for (const zone of zones) {
        const before = beforeByZone.get(zone.id)
        if (!before) continue
        const after = bestByCategory(zone, grouped, nearest, graph, blocked)
        for (const [category, baseline] of before) {
          const disrupted = after.get(category)
          if (!disrupted) continue
          const delay = Math.max(0, disrupted.minutes - baseline.minutes)
          if (disrupted.poi.id !== baseline.poi.id) {
            surge.set(disrupted.poi.id, (surge.get(disrupted.poi.id) ?? 0) + zone.population)
          }
          access.set(
            baseline.poi.id,
            (access.get(baseline.poi.id) ?? 0) + delay * zone.population,
          )
        }
      }

      for (const poi of pois) {
        const redirectedResidents = surge.get(poi.id) ?? 0
        const delayedResidentMinutes = access.get(poi.id) ?? 0
        if (redirectedResidents === 0 && delayedResidentMinutes === 0) continue
        const list = scoresByPoi.get(poi.id) ?? []
        list.push({
          stationId: station.id,
          stationName: station.name,
          redirectedResidents,
          delayedResidentMinutes,
        })
        scoresByPoi.set(poi.id, list)
      }
    },
    snapshot(): Record<string, PoiCriticalStation> {
      const result: Record<string, PoiCriticalStation> = {}
      for (const [poiId, scores] of scoresByPoi) {
        const byPressure = scores
          .filter((score) => score.redirectedResidents > 0)
          .sort(
            (a, b) =>
              b.redirectedResidents - a.redirectedResidents ||
              b.delayedResidentMinutes - a.delayedResidentMinutes,
          )
        const byAccess = scores
          .filter((score) => score.delayedResidentMinutes > 0)
          .sort((a, b) => b.delayedResidentMinutes - a.delayedResidentMinutes)
        const top = byPressure[0] ?? byAccess[0]
        result[poiId] = {
          stationId: top.stationId,
          stationName: top.stationName,
          pressure: byPressure.slice(0, CRITICAL_LIST_LENGTH),
          access: byAccess.slice(0, CRITICAL_LIST_LENGTH),
        }
      }
      return result
    },
  }
}
