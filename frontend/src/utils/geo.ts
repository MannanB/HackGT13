import type { LatLng } from '@/types/geography'

export const WALK_METERS_PER_MINUTE = 80

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.latitude - a.latitude)
  const dLng = toRad(b.longitude - a.longitude)
  const lat1 = toRad(a.latitude)
  const lat2 = toRad(b.latitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

export function walkMinutes(from: LatLng, to: LatLng): number {
  return (haversineKm(from, to) * 1000) / WALK_METERS_PER_MINUTE
}
