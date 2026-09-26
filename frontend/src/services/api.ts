export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

export const endpoints = {
  zones: '/api/v1/zones',
  pois: '/api/v1/pois',
  network: '/api/v1/network',
  accessEdges: '/api/v1/access-edges',
  poiCriticalCache: (fingerprint: string) =>
    `/api/v1/poi-critical-cache/${encodeURIComponent(fingerprint)}`,
  experimentalContext: '/api/v1/experimental/context',
  experimentalStreetRoutes: '/api/v1/experimental/street-routes',
} as const

interface Page<T> {
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

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new ApiError(response.status, `Request failed: ${path} (${response.status})`)
  }
  return response.json() as Promise<T>
}

export async function readRequired<T>(
  load: () => Promise<T>,
  isEmpty: (value: T) => boolean,
  emptyMessage: string,
  failureMessage: string,
): Promise<T> {
  try {
    const value = await load()
    if (isEmpty(value)) throw new Error(emptyMessage)
    return value
  } catch (error) {
    if (error instanceof Error && error.message === emptyMessage) throw error
    throw new Error(failureMessage)
  }
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
