import { endpoints, fetchAllPages } from '@/services/api'
import type { PointOfInterest, PoiCategory, ResidentialZone } from '@/types/geography'
import type { AccessEdge } from '@/types/network'
import type { MultiPolygon, Polygon } from 'geojson'

interface LonLat {
  lon: number
  lat: number
}

interface ApiZone {
  id: string
  name: string | null
  geometry: Polygon | MultiPolygon
  centroid: LonLat
  population: number
  median_income?: number | null
}

interface ApiPoi {
  id: string
  name: string
  category: string
  location: LonLat
}

const CATEGORY_ALIASES: Record<string, PoiCategory> = {
  hospital: 'hospital',
  clinic: 'clinic',
  grocery: 'grocery',
  supermarket: 'grocery',
  pharmacy: 'pharmacy',
  school: 'school',
  university: 'university',
  library: 'library',
  government: 'government',
  townhall: 'government',
  employment: 'employment',
}

function asMultiPolygon(geometry: Polygon | MultiPolygon): Polygon | MultiPolygon {
  if (geometry.type === 'Polygon') {
    return { type: 'MultiPolygon', coordinates: [geometry.coordinates] }
  }
  return geometry
}

function mapCategory(value: string): PoiCategory {
  return CATEGORY_ALIASES[value.toLowerCase()] ?? 'other'
}

export function shortZoneName(name: string): string {
  const tract = name.match(/Census Tract ([^,]+)/i)
  const county = name.match(/,\s*([^,]+?)(?: County)?,\s*Georgia/i)
  if (tract) {
    const place = county?.[1] ? `, ${county[1]}` : ''
    return `Tract ${tract[1]}${place}`
  }
  return name
}

function mapZone(row: ApiZone): ResidentialZone {
  const name = row.name?.trim() || row.id
  return {
    id: row.id,
    name: shortZoneName(name),
    geometry: asMultiPolygon(row.geometry),
    centroid: { latitude: row.centroid.lat, longitude: row.centroid.lon },
    population: row.population,
    medianIncome: row.median_income,
    transferStationIds: [],
  }
}

function mapPoi(row: ApiPoi): PointOfInterest {
  return {
    id: String(row.id),
    name: row.name,
    category: mapCategory(row.category),
    latitude: row.location.lat,
    longitude: row.location.lon,
  }
}

export async function getZones(): Promise<ResidentialZone[]> {
  try {
    const rows = await fetchAllPages<ApiZone>(endpoints.zones)
    if (rows.length === 0) throw new Error('Residential zones are empty')
    return rows.map(mapZone)
  } catch (error) {
    if (error instanceof Error && error.message === 'Residential zones are empty') throw error
    throw new Error('Could not load residential zones from the API')
  }
}

export async function getPointsOfInterest(): Promise<PointOfInterest[]> {
  try {
    const rows = await fetchAllPages<ApiPoi>(endpoints.pois)
    if (rows.length === 0) throw new Error('Points of interest are empty')
    return rows.map(mapPoi)
  } catch (error) {
    if (error instanceof Error && error.message === 'Points of interest are empty') throw error
    throw new Error('Could not load points of interest from the API')
  }
}

interface ApiAccessEdge {
  id: string
  location_type: 'zone' | 'poi'
  location_id: string
  station_id: string
  walking_minutes: number
}

export async function getAccessEdges(): Promise<AccessEdge[]> {
  try {
    const rows = await fetchAllPages<ApiAccessEdge>(endpoints.accessEdges)
    return rows.map((row) => ({
      id: row.id,
      locationType: row.location_type,
      locationId: row.location_id,
      stationId: row.station_id,
      walkingMinutes: row.walking_minutes,
    }))
  } catch (error) {
    console.warn('Access-edge API unavailable', error)
    return []
  }
}

export function attachAccess(
  zones: ResidentialZone[],
  pois: PointOfInterest[],
  edges: AccessEdge[],
): { zones: ResidentialZone[]; pois: PointOfInterest[] } {
  const zoneLinks = new Map<string, AccessEdge[]>()
  const poiLinks = new Map<string, AccessEdge[]>()
  for (const edge of edges) {
    const bucket = edge.locationType === 'zone' ? zoneLinks : poiLinks
    const current = bucket.get(edge.locationId) ?? []
    current.push(edge)
    bucket.set(edge.locationId, current)
  }

  const nextZones = zones.map((zone) => {
    const links = (zoneLinks.get(zone.id) ?? []).slice().sort(
      (a, b) => a.walkingMinutes - b.walkingMinutes,
    )
    return {
      ...zone,
      primaryStationId: links[0]?.stationId ?? zone.primaryStationId,
      transferStationIds: links.slice(1, 4).map((link) => link.stationId),
    }
  })

  const nextPois = pois.map((poi) => {
    const links = (poiLinks.get(poi.id) ?? []).slice().sort(
      (a, b) => a.walkingMinutes - b.walkingMinutes,
    )
    return {
      ...poi,
      nearestStationId: links[0]?.stationId ?? poi.nearestStationId,
    }
  })

  return { zones: nextZones, pois: nextPois }
}
