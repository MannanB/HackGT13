import { mockStations } from '@/data/mockStations'
import { mockTransitEdges } from '@/data/mockTransitEdges'
import { endpoints, mockRequest } from '@/services/api'
import type { Station, TransitEdge } from '@/types/network'

export async function getStations(): Promise<Station[]> {
  void endpoints.stations
  return mockRequest(mockStations, 80)
}

export async function getTransitEdges(): Promise<TransitEdge[]> {
  void endpoints.transitEdges
  return mockRequest(mockTransitEdges, 80)
}
