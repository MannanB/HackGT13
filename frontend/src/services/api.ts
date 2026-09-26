export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

export const endpoints = {
  stations: '/api/v1/stations',
  transitEdges: '/api/v1/transit-edges',
  zones: '/api/v1/zones',
  pois: '/api/v1/pois',
  network: '/api/v1/network',
  accessEdges: '/api/v1/access-edges',
  simulate: '/api/v1/scenarios',
  scenario: (id: string) => `/api/v1/scenarios/${id}`,
  impacts: (id: string) => `/api/v1/scenarios/${id}/impacts`,
  trace: (id: string) => `/api/v1/scenarios/${id}/trace`,
} as const

export interface Page<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`)
  if (!response.ok) {
    throw new ApiError(response.status, `Request failed: ${path} (${response.status})`)
  }
  return response.json() as Promise<T>
}

export async function fetchAllPages<T>(path: string, pageSize = 200): Promise<T[]> {
  const items: T[] = []
  let offset = 0
  const separator = path.includes('?') ? '&' : '?'
  while (true) {
    const page = await apiGet<Page<T>>(
      `${path}${separator}limit=${pageSize}&offset=${offset}`,
    )
    items.push(...page.items)
    offset += page.items.length
    if (page.items.length === 0 || offset >= page.total) break
  }
  return items
}
