import { apiDelete, apiPost, endpoints } from '@/services/api'
import { mapStation, mapTransitEdge, type ApiStation, type ApiTransitEdge } from '@/services/stationService'
import type { MartaLine, Station, TransitEdge } from '@/types/network'

/** Backend line names are capitalised ("Red"); the UI uses lowercase. */
function apiLine(line: MartaLine): string {
  return line.charAt(0).toUpperCase() + line.slice(1)
}

export interface StationBuildInput {
  name: string
  longitude: number
  latitude: number
  line: MartaLine
  extraLines: MartaLine[]
  neighbors: { stationId: string; travelMinutes: number | null }[]
  frequencyMinutes: number | null
}

export interface StationBuildResult {
  station: Station
  transitEdges: TransitEdge[]
  removedEdges: number
  accessEdges: number
  totalAccessEdges: number
}

interface ApiStationBuildResult {
  station: ApiStation
  transit_edges: ApiTransitEdge[]
  removed_edges: number
  access_edges: number
  total_access_edges: number
}

export async function createStation(input: StationBuildInput): Promise<StationBuildResult> {
  const result = await apiPost<ApiStationBuildResult>(endpoints.buildStations, {
    name: input.name,
    location: { lon: input.longitude, lat: input.latitude },
    line: apiLine(input.line),
    extra_lines: input.extraLines.map(apiLine),
    neighbors: input.neighbors.map((item) => ({
      station_id: item.stationId,
      travel_minutes: item.travelMinutes,
    })),
    frequency_minutes: input.frequencyMinutes,
  })
  return {
    station: mapStation(result.station),
    transitEdges: result.transit_edges
      .map(mapTransitEdge)
      .filter((edge): edge is TransitEdge => edge !== null),
    removedEdges: result.removed_edges,
    accessEdges: result.access_edges,
    totalAccessEdges: result.total_access_edges,
  }
}

export interface StationRemoveResult {
  station: Station
  removedEdges: number
  bridgedEdges: TransitEdge[]
  totalAccessEdges: number
}

interface ApiStationRemoveResult {
  station: ApiStation
  removed_edges: number
  bridged_edges: ApiTransitEdge[]
  total_access_edges: number
}

export async function removeStation(stationId: string): Promise<StationRemoveResult> {
  const result = await apiDelete<ApiStationRemoveResult>(
    `${endpoints.buildStations}/${encodeURIComponent(stationId)}`,
  )
  return {
    station: mapStation(result.station),
    removedEdges: result.removed_edges,
    bridgedEdges: result.bridged_edges
      .map(mapTransitEdge)
      .filter((edge): edge is TransitEdge => edge !== null),
    totalAccessEdges: result.total_access_edges,
  }
}
