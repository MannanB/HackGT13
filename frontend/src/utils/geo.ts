import type { MultiPolygon } from 'geojson'
import type { LatLng } from '@/types/geography'

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

export function blobPolygon(
  lat: number,
  lng: number,
  radiusKm: number,
  seed: number,
  points = 22,
): MultiPolygon {
  const coords: [number, number][] = []
  for (let i = 0; i <= points; i += 1) {
    const t = i / points
    const angle = t * Math.PI * 2
    const wobble =
      0.72 +
      0.18 * Math.sin(angle * 3 + seed) +
      0.1 * Math.cos(angle * 5 + seed * 1.3)
    const r = radiusKm * wobble
    const dLat = (r / 111) * Math.cos(angle)
    const dLng =
      (r / (111 * Math.cos((lat * Math.PI) / 180))) * Math.sin(angle)
    coords.push([lng + dLng, lat + dLat])
  }
  return {
    type: 'MultiPolygon',
    coordinates: [[coords]],
  }
}

export function pathCoordinates(
  nodes: { longitude: number; latitude: number }[],
): [number, number][] {
  return nodes.map((node) => [node.longitude, node.latitude])
}
