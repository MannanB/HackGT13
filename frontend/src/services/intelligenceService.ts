import { API_BASE, ApiError } from '@/services/api'
import type { Station } from '@/types/network'
import type { IntelInterpretation } from '@/types/intelligence'

export async function interpretEvent(
  event: string,
  stations: Station[],
  context = '',
): Promise<IntelInterpretation> {
  const response = await fetch(`${API_BASE}/api/v1/intelligence/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event,
      context,
      stations: stations.map((station) => ({
        id: station.id,
        name: station.name,
        latitude: station.latitude,
        longitude: station.longitude,
        lines: station.lines,
      })),
    }),
  })
  if (!response.ok) {
    let detail = `Request failed (${response.status})`
    try {
      const body = (await response.json()) as { detail?: string }
      if (body.detail) detail = body.detail
    } catch {
      /* ignore */
    }
    throw new ApiError(response.status, detail)
  }
  return response.json() as Promise<IntelInterpretation>
}
