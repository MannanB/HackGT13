import type { Map as MapLibreMap } from 'maplibre-gl'

type StopExpr = { stops: [number, number][]; type?: string; base?: number }

function scaleNumeric(value: unknown, factor: number, floor: number): unknown {
  if (typeof value === 'number') return Math.max(floor, value * factor)
  if (value && typeof value === 'object' && Array.isArray((value as StopExpr).stops)) {
    const expr = value as StopExpr
    return {
      ...expr,
      stops: expr.stops.map(([zoom, amount]) => [zoom, Math.max(floor, amount * factor)] as [number, number]),
    }
  }
  return value
}

/** Thin and fade Carto road casings so MARTA and choropleth stay readable. */
export function softenBasemapRoads(map: MapLibreMap) {
  const layers = map.getStyle()?.layers ?? []
  for (const layer of layers) {
    if (layer.type !== 'line' || layer['source-layer'] !== 'transportation') continue
    const id = layer.id
    if (id.includes('rail')) {
      map.setLayoutProperty(id, 'visibility', 'none')
      continue
    }
    map.setPaintProperty(id, 'line-width', scaleNumeric(map.getPaintProperty(id, 'line-width'), 0.42, 0.12) as never)
    const opacity = map.getPaintProperty(id, 'line-opacity')
    map.setPaintProperty(id, 'line-opacity', scaleNumeric(opacity ?? 1, 0.36, 0.08) as never)
  }
}
