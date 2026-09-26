import { PathLayer, ScatterplotLayer } from '@deck.gl/layers'
import { dashed } from '@/components/map/dash'
import type { PathNode, RoutePath } from '@/types/simulation'
import type { RGBA } from '@/utils/constants'

interface Leg {
  path: [number, number][]
  walk: boolean
}

function legs(route: RoutePath): Leg[] {
  const out: Leg[] = []
  const { nodes } = route
  for (let i = 0; i < nodes.length - 1; i += 1) {
    const a = nodes[i]
    const b = nodes[i + 1]
    if (a.failed || b.failed) continue
    const walk = a.type !== 'station' || b.type !== 'station'
    const point: [number, number] = [b.longitude, b.latitude]
    const last = out[out.length - 1]
    if (last && last.walk === walk && !walk) last.path.push(point)
    else out.push({ path: [[a.longitude, a.latitude], point], walk })
  }
  return out
}

function routeLayers(id: string, route: RoutePath, color: [number, number, number], strong: boolean) {
  const data = legs(route)
  const rgba = (alpha: number): RGBA => [...color, alpha]
  const layers = []
  if (strong) {
    layers.push(
      new PathLayer<Leg>({
        id: `${id}-glow`,
        data: data.filter((leg) => !leg.walk),
        getPath: (d) => d.path,
        getColor: rgba(70),
        getWidth: 14,
        widthUnits: 'pixels',
        capRounded: true,
        jointRounded: true,
      }),
    )
  }
  layers.push(
    new PathLayer<Leg>({
      id: `${id}-ride`,
      data: data.filter((leg) => !leg.walk),
      getPath: (d) => d.path,
      getColor: rgba(strong ? 255 : 170),
      getWidth: strong ? 4.5 : 3,
      widthUnits: 'pixels',
      capRounded: true,
      jointRounded: true,
      ...(strong ? {} : dashed([3, 2])),
    }),
    new PathLayer<Leg>({
      id: `${id}-walk`,
      data: data.filter((leg) => leg.walk),
      getPath: (d) => d.path,
      getColor: rgba(strong ? 230 : 140),
      getWidth: 2,
      widthUnits: 'pixels',
      capRounded: true,
      ...dashed([1, 2.2]),
    }),
    new ScatterplotLayer<PathNode>({
      id: `${id}-ends`,
      data: [route.nodes[0], route.nodes[route.nodes.length - 1]].filter(Boolean),
      getPosition: (d) => [d.longitude, d.latitude],
      getRadius: 5,
      radiusUnits: 'pixels',
      getFillColor: [5, 7, 11, 255],
      getLineColor: rgba(255),
      stroked: true,
      lineWidthMinPixels: 2,
    }),
  )
  return layers
}

export function createRouteLayers(normal: RoutePath | null, disrupted: RoutePath | null) {
  return [
    ...(normal ? routeLayers('route-normal', normal, [180, 189, 202], false) : []),
    ...(disrupted ? routeLayers('route-disrupted', disrupted, [124, 196, 255], true) : []),
  ]
}
