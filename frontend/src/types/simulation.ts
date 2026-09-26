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
  /** Modeled transit-dependent trip assignments during the selected hour. */
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
  /** Additional modeled trips accumulated since the closure started. */
  addedDemand: number
  capacity: number | null
  loadRatio: number | null
}

export interface PoiStationPressure {
  stationId: string
  stationName: string
  /** Residents whose best option for this category switches to this facility. */
  redirectedResidents: number
  /** Added minutes × residents for people who already used this facility. */
  delayedResidentMinutes: number
}

export interface PoiCriticalStation {
  stationId: string
  stationName: string
  /** Stations whose closure sends extra residents here, most first. */
  pressure: PoiStationPressure[]
  /** Stations whose closure slows existing trips here, most first. */
  access: PoiStationPressure[]
}

export interface HospitalCapacity {
  poiId: string
  poiName: string
  /** Licensed/staffed bed proxy from CMS, or null when the facility is unmatched. */
  capacity: number | null
  /** Historically occupied beds estimated from CMS inpatient days / bed-days. */
  baselineDemand: number | null
  /** Projected occupied beds at the selected elapsed scenario time. */
  demand: number | null
  /** Share of real beds occupied, or null when capacity is unknown. */
  loadRatio: number | null
  /** Closure-induced admissions still occupying beds. */
  addedDemand: number
  /** Historical CMS occupancy ratio used as the starting state. */
  baselineOccupancyRate: number | null
  /** Closure-induced admissions arriving in the selected hour. */
  incomingAdmissionsPerHour: number
  /** Patients above reported bed capacity. */
  overflowPatients: number
  /** Projected clock minute when capacity is crossed, possibly after midnight. */
  projectedFullMinute: number | null
  averageLengthOfStayDays: number | null
  utilizationReportEnd: string | null
  atMaxCapacity: boolean
}

export interface ImpactSummary {
  populationAffected: number
  /** Modeled transit-dependent arrivals affected during the selected clock hour. */
  visitorsAffected: number
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

export interface PassengerJourney {
  id: string
  path: RoutePath
  estimatedTrips: number
  delayMinutes: number
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
  hospitalCapacity: HospitalCapacity[]
  traces: Record<string, TraceImpact>
  flowJourneys?: PassengerJourney[]
}

export interface SimulateScenarioRequest {
  maintenanceStations: string[]
  shutdownStations: string[]
  serviceCategories: PoiCategory[]
  zones: ResidentialZone[]
  pois: PointOfInterest[]
  stations: Station[]
  transitEdges: TransitEdge[]
  timeMinute?: number
  failureStartMinute?: number
  failureElapsedMinutes?: number
}
