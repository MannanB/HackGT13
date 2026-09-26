import type { PointOfInterest, PoiCategory, ResidentialZone } from './geography'
import type { Station, TransitEdge } from './network'

export type AppMode = 'simulate' | 'discover' | 'recover'

export type SimulationStatus = 'idle' | 'loading' | 'success' | 'error'

export interface Scenario {
  id: string
  createdAt: string
  closedStations: string[]
  description: string
}

export interface ZoneImpact {
  zoneId: string
  zoneName: string
  poiId: string
  poiName: string
  normalTravelMinutes: number
  disruptedTravelMinutes: number | null
  delayMinutes: number
  population: number
  severity: number
  lostAccess: boolean
}

export interface PoiPressure {
  poiId: string
  poiName: string
  category: PoiCategory
  baselinePopulation: number
  disruptedPopulation: number
  addedPopulation: number
}

export interface ImpactSummary {
  populationAffected: number
  averageAddedTravelMinutes: number
  zonesAffected: number
  communitiesLosingAccess: number
}

export type PathNodeType = 'zone' | 'station' | 'poi'

export interface PathNode {
  type: PathNodeType
  id: string
  name: string
  latitude: number
  longitude: number
  failed?: boolean
}

export interface RoutePath {
  nodes: PathNode[]
  travelMinutes: number
}

export interface TraceImpact {
  zoneId: string
  poiId: string
  normalTravelMinutes: number
  disruptedTravelMinutes: number | null
  delayMinutes: number
  normalPath: RoutePath
  disruptedPath: RoutePath
}

export interface SimulationResult {
  scenario: Scenario
  summary: ImpactSummary
  zoneImpacts: ZoneImpact[]
  poiPressure: PoiPressure[]
  failedStations: string[]
  reroutedPaths: RoutePath[]
  traces: Record<string, TraceImpact>
}

export interface SimulateScenarioRequest {
  closedStations: string[]
  serviceCategories: PoiCategory[]
  zones?: ResidentialZone[]
  pois?: PointOfInterest[]
  stations?: Station[]
  transitEdges?: TransitEdge[]
}

export interface TraceImpactRequest {
  scenarioId: string
  zoneId: string
  poiId?: string
}
