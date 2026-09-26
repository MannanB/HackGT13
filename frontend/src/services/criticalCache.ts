import type { PointOfInterest, ResidentialZone } from '@/types/geography'
import type { Station, TransitEdge } from '@/types/network'
import type { PoiCriticalStation } from '@/types/simulation'

const CACHE_KEY = 'ripple.poi-critical.v1'

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
  const stations = input.stations
    .map((station) => `${station.id}:${station.latitude.toFixed(5)}:${station.longitude.toFixed(5)}`)
    .join('|')
  const edges = input.transitEdges
    .map((edge) => `${edge.fromStation}>${edge.toStation}:${edge.line}:${edge.travelMinutes}`)
    .join('|')
  const zones = input.zones.map((zone) => `${zone.id}:${zone.population}`).join('|')
  const pois = input.pois
    .map((poi) => `${poi.id}:${poi.category}:${poi.latitude.toFixed(5)}:${poi.longitude.toFixed(5)}`)
    .join('|')
  return fnv1a(`${stations}\n${edges}\n${zones}\n${pois}`)
}

export function readCriticalCache(
  fingerprint: string,
): Record<string, PoiCriticalStation> | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const record = JSON.parse(raw) as CacheRecord
    if (record.fingerprint !== fingerprint || !record.snapshot) return null
    return record.snapshot
  } catch {
    return null
  }
}

export function writeCriticalCache(
  fingerprint: string,
  snapshot: Record<string, PoiCriticalStation>,
): void {
  try {
    const record: CacheRecord = { fingerprint, snapshot }
    localStorage.setItem(CACHE_KEY, JSON.stringify(record))
  } catch {
    // Quota or private mode — skip; next visit will recompute.
  }
}
