import type { MultiPolygon, Polygon } from 'geojson'

export type PoiCategory =
  | 'hospital'
  | 'clinic'
  | 'grocery'
  | 'pharmacy'
  | 'school'
  | 'university'
  | 'library'
  | 'government'
  | 'employment'
  | 'other'

export interface LatLng {
  latitude: number
  longitude: number
}

export interface StationAccess {
  stationId: string
  walkingMinutes: number
}

export type StreetRouteMap = Record<string, [number, number][]>

export interface ResidentialZone {
  id: string
  name: string
  geometry: Polygon | MultiPolygon
  centroid: LatLng
  population: number
  medianIncome?: number | null
  households?: number | null
  noVehicleHouseholds?: number | null
  workers?: number | null
  transitCommuters?: number | null
  povertyPopulation?: number | null
  povertyUniverse?: number | null
  employedPopulation?: number | null
  disabledPopulation?: number | null
  children?: number | null
  seniors?: number | null
  limitedEnglishHouseholds?: number | null
  limitedEnglishUniverse?: number | null
  commuteJobs?: number | null
  margins?: Record<string, number | null>
  primaryStationId?: string
  transferStationIds: string[]
  stationAccess?: StationAccess[]
}

export interface PointOfInterest {
  id: string
  name: string
  category: PoiCategory
  latitude: number
  longitude: number
  source?: string | null
  sourceId?: string | null
  jobsCount?: number | null
  enrollment?: number | null
  capacity?: number | null
  capacitySource?: string | null
  baselineOccupancyRate?: number | null
  averageLengthOfStayDays?: number | null
  utilizationReportEnd?: string | null
  openingHours?: string | null
  nearestStationId?: string
  stationAccess?: StationAccess[]
}
