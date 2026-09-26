import { apiGet, apiPut, endpoints } from '@/services/api'
import type { PointOfInterest, ResidentialZone } from '@/types/geography'
import type { Station, TransitEdge } from '@/types/network'
import type { PoiCriticalStation } from '@/types/simulation'

interface CacheRecord {
  fingerprint: string
  snapshot: Record<string, PoiCriticalStation>
}

function fnv1a(value: string): string {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

export function networkFingerprint(input: {
  stations: Station[]
  transitEdges: TransitEdge[]
  zones: ResidentialZone[]
  pois: PointOfInterest[]
}): string {
  const stations = [...input.stations]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((station) => `${station.id}:${station.latitude.toFixed(5)}:${station.longitude.toFixed(5)}`)
    .join('|')
  const edges = [...input.transitEdges]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((edge) => `${edge.fromStation}>${edge.toStation}:${edge.line}:${edge.travelMinutes}`)
    .join('|')
  const zones = [...input.zones]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((zone) => `${zone.id}:${zone.population}`)
    .join('|')
  const pois = [...input.pois]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((poi) => `${poi.id}:${poi.category}:${poi.latitude.toFixed(5)}:${poi.longitude.toFixed(5)}`)
    .join('|')
  return fnv1a(`${stations}\n${edges}\n${zones}\n${pois}`)
}

export async function readCriticalCache(
  fingerprint: string,
): Promise<Record<string, PoiCriticalStation> | null> {
  try {
    const record = await apiGet<CacheRecord>(endpoints.poiCriticalCache(fingerprint))
    if (record.fingerprint !== fingerprint || !record.snapshot) return null
    return record.snapshot
  } catch {
    return null
  }
}

export async function writeCriticalCache(
  fingerprint: string,
  snapshot: Record<string, PoiCriticalStation>,
): Promise<void> {
  try {
    await apiPut(endpoints.poiCriticalCache(fingerprint), { snapshot })
  } catch {
    // API unavailable — next visit will recompute.
  }
}
