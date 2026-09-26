import { PathLayer } from '@deck.gl/layers'
import { dashed } from '@/components/map/dash'
import type { Station, TransitEdge } from '@/types/network'
import { MARTA_LINE_RGB, STATE_RGB, type RGB } from '@/utils/constants'

interface Segment {
  id: string
  path: [number, number][]
  color: RGB
}

const OFFSET: Partial<Record<TransitEdge['line'], [number, number]>> = {
  gold: [0.00022, 0],
  green: [0, 0.0002],
}

export function createMartaNetworkLayers(
  edges: TransitEdge[],
  stations: Station[],
  shutdownIds: Set<string>,
) {
  const lookup = new Map(stations.map((station) => [station.id, station]))
  const live: Segment[] = []
  const cut: Segment[] = []
  for (const edge of edges) {
    const from = lookup.get(edge.fromStation)
    const to = lookup.get(edge.toStation)
    if (!from || !to) continue
    const [dx, dy] = OFFSET[edge.line] ?? [0, 0]
    const segment: Segment = {
      id: edge.id,
      path: [
        [from.longitude + dx, from.latitude + dy],
        [to.longitude + dx, to.latitude + dy],
      ],
      color: MARTA_LINE_RGB[edge.line],
    }
    if (shutdownIds.has(edge.fromStation) || shutdownIds.has(edge.toStation)) cut.push(segment)
    else live.push(segment)
  }

  return [
    new PathLayer<Segment>({
      id: 'marta-core',
      data: live,
      getPath: (d) => d.path,
      getColor: (d) => [...d.color, 255],
      getWidth: 6,
      widthUnits: 'pixels',
      capRounded: true,
      jointRounded: true,
    }),
    new PathLayer<Segment>({
      id: 'marta-cut',
      data: cut,
      getPath: (d) => d.path,
      getColor: [...STATE_RGB.shutdown, 190],
      getWidth: 4.5,
      widthUnits: 'pixels',
      ...dashed([2, 2.5]),
    }),
  ]
}
