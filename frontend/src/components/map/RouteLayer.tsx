import { PathStyleExtension } from '@deck.gl/extensions'
import { PathLayer } from '@deck.gl/layers'
import type { RoutePath } from '@/types/simulation'

interface DrawnPath {
  path: [number, number][]
}

const dashExtension = new PathStyleExtension({ dash: true })

function splitRoute(path: RoutePath) {
  const rail: DrawnPath[] = []
  const walk: DrawnPath[] = []
  let railPath: [number, number][] = []

  const flushRail = () => {
    if (railPath.length > 1) rail.push({ path: railPath })
    railPath = []
  }

  const blocked = (node: RoutePath['nodes'][number]) => node.type === 'station' && node.failed

  const nodes = path.nodes
  for (let index = 0; index < nodes.length - 1; index += 1) {
    const from = nodes[index]
    const to = nodes[index + 1]
    if (blocked(from) || blocked(to)) {
      flushRail()
      continue
    }
    const start: [number, number] = [from.longitude, from.latitude]
    const end: [number, number] = [to.longitude, to.latitude]
    if (from.type === 'station' && to.type === 'station') {
      if (railPath.length === 0) railPath.push(start)
      railPath.push(end)
      continue
    }
    flushRail()
    walk.push({ path: [start, end] })
  }
  flushRail()
  return { rail, walk }
}

function pathLayer(
  id: string,
  data: DrawnPath[],
  color: [number, number, number, number],
  width: number,
  dashed: boolean,
) {
  return new PathLayer<DrawnPath>({
    id,
    data,
    getPath: (item) => item.path,
    getColor: color,
    getWidth: width,
    widthUnits: 'pixels',
    capRounded: true,
    jointRounded: true,
    ...(dashed
      ? { getDashArray: [2, 3], dashJustified: true, extensions: [dashExtension] }
      : {}),
  })
}

export function createRouteLayers(normal?: RoutePath | null, disrupted?: RoutePath | null) {
  const layers = []
  if (normal) {
    const parts = splitRoute(normal)
    if (parts.rail.length) layers.push(pathLayer('route-normal-rail', parts.rail, [183, 195, 211, 190], 2.5, true))
    if (parts.walk.length) layers.push(pathLayer('route-normal-walk', parts.walk, [183, 195, 211, 140], 1.5, true))
  }
  if (disrupted) {
    const parts = splitRoute(disrupted)
    if (parts.rail.length) layers.push(pathLayer('route-disrupted-rail', parts.rail, [59, 130, 246, 230], 4, false))
    if (parts.walk.length) layers.push(pathLayer('route-disrupted-walk', parts.walk, [125, 211, 252, 210], 2, true))
  }
  return layers
}
