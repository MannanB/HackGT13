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
  shutdownStationIds: string[],
) {
  const lookup = new Map(stations.map((station) => [station.id, station]))
  const shutdown = new Set(shutdownStationIds)
  const data: NetworkDatum[] = edges.flatMap((edge) => {
    const from = lookup.get(edge.fromStation)
    const to = lookup.get(edge.toStation)
    if (!from || !to) return []
    const broken = shutdown.has(edge.fromStation) || shutdown.has(edge.toStation)
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
        color: broken ? ([227, 24, 55, 120] as [number, number, number, number]) : color,
        width: broken ? 2 : 3.5,
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
