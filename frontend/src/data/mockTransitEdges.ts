import { mockStations } from '@/data/mockStations'
import type { MartaLine, TransitEdge } from '@/types/network'

const sequences: { line: MartaLine; stationIds: string[]; minutes: number[] }[] = [
  {
    line: 'red',
    stationIds: [
      'AIRPORT',
      'COLLEGE_PARK',
      'EAST_POINT',
      'LAKEWOOD',
      'OAKLAND_CITY',
      'WEST_END',
      'GARNETT',
      'FIVE_POINTS',
      'PEACHTREE_CENTER',
      'CIVIC_CENTER',
      'NORTH_AVENUE',
      'MIDTOWN',
      'ARTS_CENTER',
      'LINDBERGH',
      'BUCKHEAD',
    ],
    minutes: [4, 5, 4, 3, 3, 3, 2, 2, 2, 2, 2, 2, 5, 5],
  },
  {
    line: 'gold',
    stationIds: [
      'AIRPORT',
      'COLLEGE_PARK',
      'EAST_POINT',
      'LAKEWOOD',
      'OAKLAND_CITY',
      'WEST_END',
      'GARNETT',
      'FIVE_POINTS',
      'PEACHTREE_CENTER',
      'CIVIC_CENTER',
      'NORTH_AVENUE',
      'MIDTOWN',
      'ARTS_CENTER',
      'LINDBERGH',
      'LENOX',
      'BROOKHAVEN',
    ],
    minutes: [4, 5, 4, 3, 3, 3, 2, 2, 2, 2, 2, 2, 5, 4, 3],
  },
  {
    line: 'blue',
    stationIds: [
      'ASHBY',
      'VINE_CITY',
      'FIVE_POINTS',
      'GEORGIA_STATE',
      'KING_MEMORIAL',
      'INMAN_PARK',
      'EDGEWOOD',
      'EAST_LAKE',
      'DECATUR',
    ],
    minutes: [2, 3, 2, 2, 3, 3, 4, 4],
  },
  {
    line: 'green',
    stationIds: [
      'BANKHEAD',
      'ASHBY',
      'VINE_CITY',
      'FIVE_POINTS',
      'GEORGIA_STATE',
      'KING_MEMORIAL',
      'INMAN_PARK',
      'EDGEWOOD',
    ],
    minutes: [4, 2, 3, 2, 2, 3, 3],
  },
]

function edgesFromSequence(
  line: MartaLine,
  stationIds: string[],
  minutes: number[],
): TransitEdge[] {
  const known = new Set(mockStations.map((station) => station.id))
  const edges: TransitEdge[] = []
  for (let i = 0; i < stationIds.length - 1; i += 1) {
    const fromStation = stationIds[i]
    const toStation = stationIds[i + 1]
    if (!known.has(fromStation) || !known.has(toStation)) continue
    edges.push({
      id: `${line}-${fromStation}-${toStation}`,
      fromStation,
      toStation,
      travelMinutes: minutes[i] ?? 3,
      line,
      frequencyMinutes: line === 'green' ? 12 : 8,
    })
  }
  return edges
}

export const mockTransitEdges: TransitEdge[] = sequences.flatMap((item) =>
  edgesFromSequence(item.line, item.stationIds, item.minutes),
)
