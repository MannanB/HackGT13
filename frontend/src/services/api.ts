import { delay } from '@/utils/constants'

const DEFAULT_LATENCY = 120

export async function mockRequest<T>(value: T, latency = DEFAULT_LATENCY): Promise<T> {
  await delay(latency)
  return value
}

export const endpoints = {
  stations: '/stations',
  transitEdges: '/transit-edges',
  zones: '/zones',
  pois: '/pois',
  simulate: '/scenarios/simulate',
  scenario: (id: string) => `/scenarios/${id}`,
  impacts: (id: string) => `/scenarios/${id}/impacts`,
  trace: (id: string) => `/scenarios/${id}/trace`,
} as const
