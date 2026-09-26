import { PathLayer, ScatterplotLayer } from '@deck.gl/layers'
import type { PassengerJourney, SimulationResult } from '@/types/simulation'
import type { StreetRouteMap } from '@/types/geography'
import { SURGE_RGB, type RGB, type RGBA } from '@/utils/constants'

type FlowStage = 'boarding' | 'train' | 'exit'

interface StagePath {
  path: [number, number][]
  cumulative: number[]
  totalLength: number
  stage: FlowStage
  share: number
  congested: boolean
}

interface FlowRoute {
  id: string
  stages: StagePath[]
  totalLength: number
  estimatedTrips: number
  phase: number
  congested: boolean
}

interface FlowLeg {
  path: [number, number][]
  stage: FlowStage
  highlighted: boolean
}

interface Passenger {
  id: string
  position: [number, number]
  color: RGB
  weight: number
  highlighted: boolean
}

interface Pulse {
  id: string
  position: [number, number]
  color: RGB
  phase: number
  weight: number
  highlighted: boolean
}

const STAGE_COLORS: Record<FlowStage, RGB> = {
  boarding: [245, 190, 70],
  train: [155, 218, 255],
  exit: [194, 148, 255],
}
const PASSENGER_COLOR: RGB = [224, 241, 255]
const VISUAL_SPEED_KM_PER_SECOND = 0.42
const BASE_HEADWAY_SECONDS = 3.2
/** Extra trips on a street before it can even be considered congested. */
const MIN_SURGE_EXTRA_TRIPS = 140
/** Disrupted traffic must be at least this multiple of the baseline load. */
const MIN_SURGE_RATIO = 3
/** Only the peak congestion band is drawn red (share of the busiest extra load). */
const MAX_THICKNESS_SHARE = 0.8
const ROUTE_CACHE = new WeakMap<object, { streetRoutes: StreetRouteMap; routes: FlowRoute[] }>()
const CONGESTION_CACHE = new WeakMap<object, { baseline: PassengerJourney[]; streetRoutes: StreetRouteMap }>()

function quantizeCoord(value: number) {
  return value.toFixed(3)
}

function streetSegmentKey(a: [number, number], b: [number, number]) {
  const start = `${quantizeCoord(a[0])},${quantizeCoord(a[1])}`
  const end = `${quantizeCoord(b[0])},${quantizeCoord(b[1])}`
  return start < end ? `${start}|${end}` : `${end}|${start}`
}

function forEachStreetSegment(path: [number, number][], visit: (key: string) => void) {
  for (let index = 1; index < path.length; index += 1) {
    visit(streetSegmentKey(path[index - 1], path[index]))
  }
}

function streetTouchesSurge(path: [number, number][], surged: Set<string>) {
  for (let index = 1; index < path.length; index += 1) {
    if (surged.has(streetSegmentKey(path[index - 1], path[index]))) return true
  }
  return false
}

function occupancyByStreet(routes: FlowRoute[]) {
  const load = new Map<string, number>()
  for (const route of routes) {
    const trips = Math.max(0, route.estimatedTrips)
    if (trips <= 0) continue
    for (const stage of route.stages) {
      if (stage.stage === 'train') continue
      forEachStreetSegment(stage.path, (key) => {
        load.set(key, (load.get(key) ?? 0) + trips)
      })
    }
  }
  return load
}

function surgedStreets(baseline: FlowRoute[], disrupted: FlowRoute[]) {
  const before = occupancyByStreet(baseline)
  const after = occupancyByStreet(disrupted)
  const candidates: { key: string; extra: number }[] = []
  for (const [key, later] of after) {
    const earlier = before.get(key) ?? 0
    const extra = later - earlier
    if (extra < MIN_SURGE_EXTRA_TRIPS) continue
    if (earlier > 0 && later / earlier < MIN_SURGE_RATIO) continue
    candidates.push({ key, extra })
  }
  if (candidates.length === 0) return new Set<string>()
  const peakExtra = candidates.reduce((max, item) => Math.max(max, item.extra), 0)
  const thicknessFloor = peakExtra * MAX_THICKNESS_SHARE
  return new Set(
    candidates.filter((item) => item.extra >= thicknessFloor).map((item) => item.key),
  )
}

function hash(value: string) {
  let output = 0
  for (let index = 0; index < value.length; index += 1) {
    output = (output * 31 + value.charCodeAt(index)) >>> 0
  }
  return (output % 10_000) / 10_000
}

function segmentDistanceKm(a: [number, number], b: [number, number]) {
  const meanLatitude = ((a[1] + b[1]) / 2) * (Math.PI / 180)
  const longitudeKm = (b[0] - a[0]) * Math.cos(meanLatitude) * 111.32
  const latitudeKm = (b[1] - a[1]) * 110.57
  return Math.hypot(longitudeKm, latitudeKm)
}

function measured(path: [number, number][], stage: FlowStage): StagePath {
  const cumulative = [0]
  for (let index = 1; index < path.length; index += 1) {
    cumulative.push(cumulative[index - 1] + segmentDistanceKm(path[index - 1], path[index]))
  }
  return { path, cumulative, totalLength: cumulative[cumulative.length - 1], stage, share: 0, congested: false }
}

function disruptedJourneys(result: SimulationResult): PassengerJourney[] {
  if (result.flowJourneys) return result.flowJourneys
  return result.zoneImpacts.flatMap((impact) => {
    const trace = result.traces[impact.zoneId]
    if (!trace) return []
    return [{
      id: impact.zoneId,
      path: trace.disruptedPath,
      estimatedTrips: impact.estimatedTrips,
      delayMinutes: impact.delayMinutes,
    }]
  })
}

function routeStages(journey: PassengerJourney, streetRoutes: StreetRouteMap): StagePath[] {
  const nodes = journey.path.nodes.filter((node) => !node.failed)
  if (nodes.length < 2) return []
  const stations = nodes.filter((node) => node.type === 'station')
  const start = nodes[0]
  const end = nodes[nodes.length - 1]
  if (stations.length < 2) {
    const directStreet = streetRoutes[`direct:${start.id}:${end.id}`]
    const directPath: [number, number][] = directStreet ?? [
      [start.longitude, start.latitude],
      [end.longitude, end.latitude],
    ]
    return [measured(directPath, 'exit')].filter((stage) => stage.totalLength > 0)
  }
  const boardingStreet = streetRoutes[`zone:${start.id}:${stations[0].id}`]
  const exitStreet = streetRoutes[`poi:${end.id}:${stations[stations.length - 1].id}`]
  return [
    boardingStreet ? measured(boardingStreet, 'boarding') : null,
    measured(stations.map((node) => [node.longitude, node.latitude]), 'train'),
    exitStreet ? measured([...exitStreet].reverse(), 'exit') : null,
  ].filter((stage): stage is StagePath => stage != null && stage.totalLength > 0)
}

function buildRoutes(key: object, journeys: PassengerJourney[], streetRoutes: StreetRouteMap): FlowRoute[] {
  const cached = ROUTE_CACHE.get(key)
  if (cached?.streetRoutes === streetRoutes) return cached.routes
  const routes = journeys.flatMap((journey) => {
    const stages = routeStages(journey, streetRoutes)
    if (stages.length === 0) return []
    const routeLength = stages.reduce((sum, stage) => sum + stage.totalLength, 0)
    for (const stage of stages) stage.share = stage.totalLength / routeLength
    return [{
      id: journey.id,
      stages,
      totalLength: routeLength,
      estimatedTrips: journey.estimatedTrips,
      phase: hash(journey.id),
      congested: false,
    }]
  })
  ROUTE_CACHE.set(key, { streetRoutes, routes })
  return routes
}

function positionAlong(path: StagePath, progress: number): [number, number] {
  const distance = progress * path.totalLength
  let index = 1
  while (index < path.cumulative.length - 1 && path.cumulative[index] < distance) index += 1
  const startDistance = path.cumulative[index - 1]
  const endDistance = path.cumulative[index]
  const mix = (distance - startDistance) / Math.max(1e-9, endDistance - startDistance)
  const [aLng, aLat] = path.path[index - 1]
  const [bLng, bLat] = path.path[index]
  return [aLng + (bLng - aLng) * mix, aLat + (bLat - aLat) * mix]
}

function markCongestedRoutes(
  result: SimulationResult,
  baseline: PassengerJourney[],
  streetRoutes: StreetRouteMap,
  routes: FlowRoute[],
) {
  const cached = CONGESTION_CACHE.get(result)
  if (cached?.baseline === baseline && cached.streetRoutes === streetRoutes) return
  const baselineRoutes = buildRoutes(baseline, baseline, streetRoutes)
  const surged = surgedStreets(baselineRoutes, routes)
  for (const route of routes) {
    let congested = false
    for (const stage of route.stages) {
      stage.congested = stage.stage !== 'train' && streetTouchesSurge(stage.path, surged)
      congested ||= stage.congested
    }
    route.congested = congested
  }
  CONGESTION_CACHE.set(result, { baseline, streetRoutes })
}

function passengerAt(route: FlowRoute, progress: number): Passenger {
  let cursor = 0
  for (let index = 0; index < route.stages.length; index += 1) {
    const stage = route.stages[index]
    const end = cursor + stage.share
    if (progress <= end || index === route.stages.length - 1) {
      const local = Math.min(1, Math.max(0, (progress - cursor) / Math.max(stage.share, 1e-9)))
      return {
        id: route.id,
        position: positionAlong(stage, local),
        color: stage.congested ? SURGE_RGB : PASSENGER_COLOR,
        weight: route.estimatedTrips,
        highlighted: stage.congested,
      }
    }
    cursor = end
  }
  const fallback = route.stages[route.stages.length - 1]
  return {
    id: route.id,
    position: fallback.path[fallback.path.length - 1],
    color: fallback.congested ? SURGE_RGB : PASSENGER_COLOR,
    weight: route.estimatedTrips,
    highlighted: fallback.congested,
  }
}

function aggregatePulses(routes: FlowRoute[]) {
  const pulses = new Map<string, Pulse>()
  const absorb = (id: string, position: [number, number], weight: number, highlighted: boolean) => {
    const existing = pulses.get(id)
    if (existing) {
      existing.weight += weight
      existing.highlighted ||= highlighted
      if (existing.highlighted) existing.color = SURGE_RGB
    } else {
      pulses.set(id, {
        id,
        position,
        color: highlighted ? SURGE_RGB : PASSENGER_COLOR,
        phase: hash(id),
        weight,
        highlighted,
      })
    }
  }
  for (const route of routes) {
    const boarding = route.stages.find((stage) => stage.stage === 'boarding')
    const exit = route.stages.find((stage) => stage.stage === 'exit')
    const boardPosition = boarding?.path.at(-1)
    const exitPosition = exit?.path.at(-1)
    if (boarding && boardPosition) {
      absorb(`board:${boardPosition.join(',')}`, boardPosition, route.estimatedTrips, boarding.congested)
    }
    if (exit && exitPosition) {
      absorb(`exit:${exitPosition.join(',')}`, exitPosition, route.estimatedTrips, exit.congested)
    }
  }
  return [...pulses.values()]
}

function flowDotScale(zoom: number) {
  return Math.max(0.16, Math.min(1.15, 2 ** ((zoom - 13.1) * 0.7)))
}

export function createPassengerFlowLayers(
  result: SimulationResult | null,
  baseline: PassengerJourney[],
  streetRoutes: StreetRouteMap,
  now: number,
  zoom: number,
) {
  const journeys = result ? disruptedJourneys(result) : baseline
  if (journeys.length === 0) return []
  const routes = buildRoutes(result ?? baseline, journeys, streetRoutes)
  if (result) markCongestedRoutes(result, baseline, streetRoutes, routes)
  const dotScale = flowDotScale(zoom)
  const baseDensityScale = 2 ** (Math.max(0, zoom - 11) * 0.72)
  const surgeDensityScale = 2 ** (Math.max(0, zoom - 12.5) * 0.22)
  const passengers = routes.flatMap((route) => {
    const highlighted = route.congested
    const demandCadence = Math.max(0.8, Math.min(2.4, Math.log10(1 + route.estimatedTrips) / 1.5))
    const densityScale = highlighted ? surgeDensityScale : baseDensityScale
    const headwaySeconds = (BASE_HEADWAY_SECONDS * densityScale) / (demandCadence * (highlighted ? 1.8 : 1))
    const particleCount = Math.max(
      highlighted ? 4 : zoom >= 13 ? 2 : 4,
      Math.ceil(route.totalLength / (VISUAL_SPEED_KM_PER_SECOND * headwaySeconds)),
    )
    return Array.from({ length: particleCount }, (_, index) => {
      const distanceTravelled = (now / 1000) * VISUAL_SPEED_KM_PER_SECOND
      return {
        ...passengerAt(route, (distanceTravelled / route.totalLength + route.phase + index / particleCount) % 1),
        id: `${route.id}-${index}`,
      }
    })
  })
  const legs: FlowLeg[] = routes.flatMap((route) =>
    route.stages.map((stage) => ({
      path: stage.path,
      stage: stage.stage,
      highlighted: stage.congested,
    })),
  )
  const baseLegs = legs.filter((leg) => !leg.highlighted)
  const surgeLegs = legs.filter((leg) => leg.highlighted)
  const glowPassengers = zoom >= 12.8 ? passengers.filter((passenger) => passenger.highlighted) : []
  const pulses = aggregatePulses(routes).filter(
    (pulse) => pulse.highlighted || zoom < 12.5,
  )
  const pathAlpha = Math.max(
    2,
    Math.min(22, Math.round(10_000 / Math.max(1, legs.length) / 2 ** (Math.max(0, zoom - 11) * 0.72))),
  )

  return [
    new PathLayer<FlowLeg>({
      id: 'passenger-flow-paths',
      data: zoom >= 13.25 ? [] : baseLegs,
      getPath: (leg) => leg.path,
      getColor: (leg): RGBA => [...STAGE_COLORS[leg.stage], pathAlpha],
      getWidth: 0.7,
      widthUnits: 'pixels',
      widthMinPixels: 0.45,
      capRounded: true,
      jointRounded: true,
      pickable: false,
    }),
    new PathLayer<FlowLeg>({
      id: 'passenger-flow-surge-paths',
      data: surgeLegs,
      getPath: (leg) => leg.path,
      getColor: [...SURGE_RGB, 120],
      getWidth: 2.2,
      widthUnits: 'pixels',
      widthMinPixels: 1.25,
      capRounded: true,
      jointRounded: true,
      pickable: false,
    }),
    new ScatterplotLayer<Passenger>({
      id: 'passenger-flow-glow',
      data: glowPassengers,
      getPosition: (passenger) => passenger.position,
      getRadius: (passenger) =>
        (passenger.highlighted ? 5.2 : Math.min(3.6, 1.8 + Math.sqrt(passenger.weight) / 64)) * dotScale,
      radiusUnits: 'pixels',
      getFillColor: (passenger): RGBA => [...passenger.color, passenger.highlighted ? 42 : 10],
      pickable: false,
      updateTriggers: { getPosition: now, getFillColor: now, getRadius: zoom },
    }),
    new ScatterplotLayer<Passenger>({
      id: 'passenger-flow-particles',
      data: passengers,
      getPosition: (passenger) => passenger.position,
      getRadius: (passenger) =>
        (passenger.highlighted ? 2.25 : Math.min(1.65, 0.75 + Math.sqrt(passenger.weight) / 95)) * dotScale,
      radiusUnits: 'pixels',
      getFillColor: (passenger): RGBA => [...passenger.color, passenger.highlighted ? 235 : 135],
      pickable: false,
      updateTriggers: { getPosition: now, getFillColor: now, getRadius: zoom },
    }),
    new ScatterplotLayer<Pulse>({
      id: 'passenger-flow-transfer-pulses',
      data: pulses,
      getPosition: (pulse) => pulse.position,
      getRadius: (pulse) =>
        (3 + Math.min(5, Math.log10(1 + pulse.weight)) + ((now / 2_200 + pulse.phase) % 1) * 5) * dotScale,
      radiusUnits: 'pixels',
      filled: false,
      stroked: true,
      getLineColor: (pulse): RGBA => [
        ...pulse.color,
        Math.round((pulse.highlighted ? 145 : 34) * (1 - ((now / 2_200 + pulse.phase) % 1))),
      ],
      lineWidthMinPixels: Math.max(0.35, 0.7 * dotScale),
      pickable: false,
      updateTriggers: { getRadius: now, getLineColor: now },
    }),
  ]
}
