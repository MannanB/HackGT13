import { apiGet, endpoints, readRequired } from '@/services/api'
import { mapMartaLine, type Station, type TransitEdge } from '@/types/network'

interface LonLat {
  lon: number
  lat: number
}

export interface ApiStation {
  id: string
  name: string
  location: LonLat
  lines: string[]
  is_active: boolean
}

export interface ApiTransitEdge {
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
  return readRequired(
    async () => {
      const data = await apiGet<ApiNetwork>(endpoints.network)
      return {
        stations: data.stations.map(mapStation),
        transitEdges: data.transit_edges
          .map(mapTransitEdge)
          .filter((edge): edge is TransitEdge => edge !== null),
      }
    },
    (network) => network.stations.length === 0,
    'Station network is empty',
    'Could not load the MARTA network from the API',
  )
}