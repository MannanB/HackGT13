import type { MultiPolygon } from 'geojson'

export type PoiCategory =
  | 'hospital'
  | 'grocery'
  | 'pharmacy'
  | 'school'
  | 'employment'

export interface LatLng {
  latitude: number
  longitude: number
}

export interface ResidentialZone {
  id: string
  name: string
  geometry: MultiPolygon
  centroid: LatLng
  population: number
  primaryStationId: string
  transferStationIds: string[]
}

export interface PointOfInterest {
  id: string
  name: string
  category: PoiCategory
  latitude: number
  longitude: number
  nearestStationId: string
}
