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

export interface ResidentialZone {
  id: string
  name: string
  geometry: Polygon | MultiPolygon
  centroid: LatLng
  population: number
  medianIncome?: number | null
  primaryStationId?: string
  transferStationIds: string[]
}

export interface PointOfInterest {
  id: string
  name: string
  category: PoiCategory
  latitude: number
  longitude: number
  nearestStationId?: string
}