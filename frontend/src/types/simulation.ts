import type { PointOfInterest, PoiCategory, ResidentialZone } from './geography'
import type { Station, TransitEdge } from './network'

export type RouteView = 'both' | 'normal' | 'disrupted'

export interface ZoneImpact {
  zoneId: string
  zoneName: string
  poiId: string
  poiName: string
  poiCategory: PoiCategory
  normalTravelMinutes: number
  disruptedTravelMinutes: number
  delayMinutes: number
  population: number
  estimatedTrips: number
}

export interface PoiPressure {
  poiId: string
  poiName: string
  category: PoiCategory
  baselineRegions: number
  disruptedRegions: number
  addedRegions: number
  baselineDemand: number
  disruptedDemand: number
  addedDemand: number
  capacity: number | null
  loadRatio: number | null
}

export interface PoiCriticalStation {
  stationId: string
  stationName: string
}

export interface ImpactSummary {
  populationAffected: number
  averageAddedTravelMinutes: number
  zonesAffected: number
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
  disruptedTravelMinutes: number
  delayMinutes: number
  normalPath: RoutePath
  disruptedPath: RoutePath
}

export interface SimulationResult {
  summary: ImpactSummary
  zoneImpacts: ZoneImpact[]
  poiPressure: PoiPressure[]
  traces: Record<string, TraceImpact>
}

export interface SimulateScenarioRequest {
  maintenanceStations: string[]
  shutdownStations: string[]
  serviceCategories: PoiCategory[]
  zones: ResidentialZone[]
  pois: PointOfInterest[]
  stations: Station[]
  transitEdges: TransitEdge[]
}
