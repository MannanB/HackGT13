import { mockPois } from '@/data/mockPois'
import { mockZones } from '@/data/mockZones'
import { endpoints, mockRequest } from '@/services/api'
import type { PointOfInterest, ResidentialZone } from '@/types/geography'

export async function getZones(): Promise<ResidentialZone[]> {
  void endpoints.zones
  return mockRequest(mockZones, 90)
}

export async function getPointsOfInterest(): Promise<PointOfInterest[]> {
  void endpoints.pois
  return mockRequest(mockPois, 90)
}
