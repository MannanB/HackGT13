import { PathLayer } from '@deck.gl/layers'
import { MARTA_LINE_COLORS } from '@/utils/constants'
import type { Station, TransitEdge } from '@/types/network'

interface NetworkDatum {
  id: string
  path: [number, number][]
  color: [number, number, number, number]
  width: number
}

export function createMartaNetworkLayer(
  edges: TransitEdge[],
  stations: Station[],
  failedStationIds: string[],
) {
  const lookup = new Map(stations.map((station) => [station.id, station]))
  const simulated = failedStationIds.length > 0
  const data: NetworkDatum[] = edges.flatMap((edge) => {
    const from = lookup.get(edge.fromStation)
    const to = lookup.get(edge.toStation)
    if (!from || !to) return []
    const broken =
      failedStationIds.includes(edge.fromStation) ||
      failedStationIds.includes(edge.toStation)
    if (broken) return []
    const color = MARTA_LINE_COLORS[edge.line]
    const shift = edge.line === 'gold' ? 0.00018 : edge.line === 'green' ? 0.00016 : 0
    const dx = edge.line === 'gold' ? shift : 0
    const dy = edge.line === 'green' ? shift : 0
    return [
      {
        id: edge.id,
        path: [
          [from.longitude + dx, from.latitude + dy],
          [to.longitude + dx, to.latitude + dy],
        ] as [number, number][],
        color: simulated
          ? ([color[0], color[1], color[2], 200] as [number, number, number, number])
          : color,
        width: 3.5,
      },
    ]
  })

  return new PathLayer<NetworkDatum>({
    id: 'marta-network',
    data,
    getPath: (d) => d.path,
    getColor: (d) => d.color,
    getWidth: (d) => d.width,
    widthUnits: 'pixels',
    capRounded: true,
    jointRounded: true,
    pickable: false,
  })
}
