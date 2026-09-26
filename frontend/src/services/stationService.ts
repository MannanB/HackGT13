import { mockStations } from '@/data/mockStations'
import { mockTransitEdges } from '@/data/mockTransitEdges'
import { apiGet, endpoints } from '@/services/api'
import { mapMartaLine, type Station, type TransitEdge } from '@/types/network'

interface LonLat {
  lon: number
  lat: number
}

interface ApiStation {
  id: string
  name: string
  location: LonLat
  lines: string[]
  is_active: boolean
}

interface ApiTransitEdge {
  id: string
  from_station: string
  to_station: string
  travel_minutes: number
  line: string
  frequency_minutes: number
}

interface ApiNetwork {
  stations: ApiStation[]
  transit_edges: ApiTransitEdge[]
}

export function mapStation(row: ApiStation): Station {
  return {
    id: row.id,
    name: row.name.replace(/ Station$/i, ''),
    latitude: row.location.lat,
    longitude: row.location.lon,
    lines: row.lines.map(mapMartaLine).filter((line): line is NonNullable<typeof line> => line !== null),
    isActive: row.is_active,
  }
}

export function mapTransitEdge(row: ApiTransitEdge): TransitEdge | null {
  const line = mapMartaLine(row.line)
  if (!line) return null
  return {
    id: row.id,
    fromStation: row.from_station,
    toStation: row.to_station,
    travelMinutes: row.travel_minutes,
    line,
    frequencyMinutes: row.frequency_minutes,
  }
}

export async function getNetwork(): Promise<{ stations: Station[]; transitEdges: TransitEdge[] }> {
  try {
    const data = await apiGet<ApiNetwork>(endpoints.network)
    const stations = data.stations.map(mapStation)
    const transitEdges = data.transit_edges
      .map(mapTransitEdge)
      .filter((edge): edge is TransitEdge => edge !== null)
    if (stations.length === 0) {
      return { stations: mockStations, transitEdges: mockTransitEdges }
    }
    return { stations, transitEdges }
  } catch (error) {
    console.warn('Network API unavailable, using mock MARTA graph', error)
    return { stations: mockStations, transitEdges: mockTransitEdges }
  }
}

export async function getStations(): Promise<Station[]> {
  const network = await getNetwork()
  return network.stations
}

export async function getTransitEdges(): Promise<TransitEdge[]> {
  const network = await getNetwork()
  return network.transitEdges
}
