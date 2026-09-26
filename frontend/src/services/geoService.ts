import { apiGet, endpoints, fetchAllPages } from '@/services/api'
import hospitalBedData from '@/data/hospitalBeds.json'
import type { PointOfInterest, PoiCategory, ResidentialZone, StreetRouteMap } from '@/types/geography'
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
  source?: string | null
  source_id?: string | null
  jobs_count?: number | null
  enrollment?: number | null
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

function shortZoneName(name: string): string {
  const tract = name.match(/Census Tract ([^;,]+)/i)?.[1]
  const group = name.match(/Block Group ([^;,]+)/i)?.[1]
  const county = name.match(/[;,]\s*([^;,]+?) County/i)?.[1]
  if (!tract) return name
  const id = group ? `${tract}·${group}` : tract
  return county ? `${county} ${id}` : `Tract ${id}`
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
    stationAccess: [],
  }
}

function mapPoi(row: ApiPoi): PointOfInterest {
  const category = mapCategory(row.category)
  return {
    id: String(row.id),
    name: row.name,
    category,
    latitude: row.location.lat,
    longitude: row.location.lon,
    source: row.source,
    sourceId: row.source_id,
    jobsCount: row.jobs_count,
    enrollment: row.enrollment,
    capacity: category === 'hospital' ? null : row.enrollment ?? row.jobs_count,
    stationAccess: [],
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
      stationAccess: links.map((link) => ({
        stationId: link.stationId,
        walkingMinutes: link.walkingMinutes,
      })),
    }
  })

  const nextPois = pois.map((poi) => {
    const links = (poiLinks.get(poi.id) ?? []).slice().sort(
      (a, b) => a.walkingMinutes - b.walkingMinutes,
    )
    return {
      ...poi,
      nearestStationId: links[0]?.stationId ?? poi.nearestStationId,
      stationAccess: links.map((link) => ({
        stationId: link.stationId,
        walkingMinutes: link.walkingMinutes,
      })),
    }
  })

  return { zones: nextZones, pois: nextPois }
}

interface ExperimentalZone {
  median_income?: number | null
  households?: number | null
  no_vehicle_households?: number | null
  workers?: number | null
  transit_commuters?: number | null
  poverty_population?: number | null
  poverty_universe?: number | null
  employed_population?: number | null
  disabled_population?: number | null
  children?: number | null
  seniors?: number | null
  limited_english_households?: number | null
  limited_english_universe?: number | null
  commute_jobs?: number | null
  margins?: Record<string, number | null>
}

interface ExperimentalPoi {
  source: string
  sourceId: string
  openingHours?: string | null
  capacity?: number | null
  enrollment?: number | null
}

interface ExperimentalContext {
  available: boolean
  zones: Record<string, ExperimentalZone>
  employmentCenters: PointOfInterest[]
  poiEnrichment: ExperimentalPoi[]
}

interface HospitalBedRecord {
  beds: number
  providerId: string
  source: string
  baselineOccupancyRate?: number
  averageLengthOfStayDays?: number
  utilizationReportEnd?: string
}

const hospitalBeds = hospitalBedData.hospitals as Record<string, HospitalBedRecord>

function attachHospitalBed(poi: PointOfInterest): PointOfInterest {
  if (poi.category !== 'hospital') return poi
  const row = hospitalBeds[`${poi.source}:${poi.sourceId}`]
  if (!row) return { ...poi, capacity: null, capacitySource: null }
  return {
    ...poi,
    capacity: row.beds,
    capacitySource: `${row.source} · CCN ${row.providerId}`,
    baselineOccupancyRate: row.baselineOccupancyRate ?? null,
    averageLengthOfStayDays: row.averageLengthOfStayDays ?? null,
    utilizationReportEnd: row.utilizationReportEnd ?? null,
  }
}

export async function getExperimentalContext(): Promise<ExperimentalContext | null> {
  try {
    const context = await apiGet<ExperimentalContext>(endpoints.experimentalContext)
    return context.available ? context : null
  } catch (error) {
    console.warn('Experimental context unavailable', error)
    return null
  }
}

export async function getStreetRoutes(): Promise<StreetRouteMap> {
  try {
    const payload = await apiGet<{ available: boolean; routes: StreetRouteMap }>(
      endpoints.experimentalStreetRoutes,
    )
    return payload.available ? payload.routes : {}
  } catch (error) {
    console.warn('Experimental street routes unavailable', error)
    return {}
  }
}

export function attachExperimental(
  zones: ResidentialZone[],
  pois: PointOfInterest[],
  context: ExperimentalContext | null,
): { zones: ResidentialZone[]; pois: PointOfInterest[] } {
  if (!context) return { zones, pois: pois.map(attachHospitalBed) }
  const nextZones = zones.map((zone) => {
    const row = context.zones[zone.id]
    if (!row) return zone
    return {
      ...zone,
      medianIncome: row.median_income ?? zone.medianIncome,
      households: row.households,
      noVehicleHouseholds: row.no_vehicle_households,
      workers: row.workers,
      transitCommuters: row.transit_commuters,
      povertyPopulation: row.poverty_population,
      povertyUniverse: row.poverty_universe,
      employedPopulation: row.employed_population,
      disabledPopulation: row.disabled_population,
      children: row.children,
      seniors: row.seniors,
      limitedEnglishHouseholds: row.limited_english_households,
      limitedEnglishUniverse: row.limited_english_universe,
      commuteJobs: row.commute_jobs,
      margins: row.margins,
    }
  })
  const enrichment = new Map(
    context.poiEnrichment.map((row) => [`${row.source}:${row.sourceId}`, row]),
  )
  const nextPois = pois.map((poi) => {
    const row = enrichment.get(`${poi.source}:${poi.sourceId}`)
    if (!row) return attachHospitalBed(poi)
    return attachHospitalBed({
      ...poi,
      openingHours: row.openingHours,
      capacity: row.capacity ?? row.enrollment ?? poi.capacity,
      enrollment: row.enrollment ?? poi.enrollment,
    })
  })
  const existing = new Set(nextPois.map((poi) => poi.id))
  const employmentCenters = context.employmentCenters
    .filter((poi) => !existing.has(poi.id))
    .map((poi) => ({ ...poi, category: mapCategory(poi.category), stationAccess: [] }))
  return { zones: nextZones, pois: [...nextPois, ...employmentCenters] }
}
