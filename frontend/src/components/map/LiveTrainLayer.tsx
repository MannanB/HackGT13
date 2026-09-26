import { IconLayer } from '@deck.gl/layers'
import type { MartaLine, Station, TransitEdge } from '@/types/network'
import { MARTA_LINES } from '@/utils/constants'

export const LIVE_TRAIN_LAYER = 'live-trains'

export interface SimTrain {
  id: string
  line: MartaLine
  latitude: number
  longitude: number
  nextStation: string
}

interface Stop {
  id: string
  name: string
  latitude: number
  longitude: number
}

const LOOP_MS = 55_000

function orderLine(line: MartaLine, stations: Station[], edges: TransitEdge[]): Stop[] {
  const byId = new Map(stations.map((station) => [station.id, station]))
  const adjacency = new Map<string, Set<string>>()
  for (const edge of edges) {
    if (edge.line !== line) continue
    if (!adjacency.has(edge.fromStation)) adjacency.set(edge.fromStation, new Set())
    if (!adjacency.has(edge.toStation)) adjacency.set(edge.toStation, new Set())
    adjacency.get(edge.fromStation)!.add(edge.toStation)
    adjacency.get(edge.toStation)!.add(edge.fromStation)
  }
  const terminals = [...adjacency.keys()].filter((id) => adjacency.get(id)!.size === 1)
  const start = (terminals.length ? terminals : [...adjacency.keys()])
    .map((id) => byId.get(id))
    .filter((station): station is Station => Boolean(station))
    .sort((a, b) =>
      line === 'red' || line === 'gold' ? b.latitude - a.latitude : a.longitude - b.longitude,
    )[0]
  if (!start) return []

  const ordered: Stop[] = []
  const seen = new Set<string>()
  let cursor: string | undefined = start.id
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor)
    const station = byId.get(cursor)
    if (station) ordered.push(station)
    cursor = [...(adjacency.get(cursor) ?? [])].find((id) => !seen.has(id))
  }
  return ordered
}

function openRuns(stops: Stop[], shutdown: Set<string>): Stop[][] {
  const runs: Stop[][] = []
  let current: Stop[] = []
  for (const stop of stops) {
    if (shutdown.has(stop.id)) {
      if (current.length > 1) runs.push(current)
      current = []
    } else {
      current.push(stop)
    }
  }
  if (current.length > 1) runs.push(current)
  return runs
}

function along(stops: Stop[], t: number): { latitude: number; longitude: number; nextStation: string } {
  const lengths: number[] = []
  let total = 0
  for (let i = 0; i < stops.length - 1; i += 1) {
    const a = stops[i]
    const b = stops[i + 1]
    const length = Math.hypot(b.longitude - a.longitude, b.latitude - a.latitude)
    lengths.push(length)
    total += length
  }
  let remaining = (t % 1) * total
  for (let i = 0; i < lengths.length; i += 1) {
    if (remaining <= lengths[i] || i === lengths.length - 1) {
      const span = lengths[i] || 1
      const mix = Math.min(1, remaining / span)
      const a = stops[i]
      const b = stops[i + 1]
      return {
        longitude: a.longitude + (b.longitude - a.longitude) * mix,
        latitude: a.latitude + (b.latitude - a.latitude) * mix,
        nextStation: mix < 0.5 ? a.name : b.name,
      }
    }
    remaining -= lengths[i]
  }
  const last = stops[stops.length - 1]
  return { latitude: last.latitude, longitude: last.longitude, nextStation: last.name }
}

export function simulatedTrains(
  stations: Station[],
  edges: TransitEdge[],
  shutdown: Set<string>,
  now: number,
): SimTrain[] {
  const trains: SimTrain[] = []
  for (const line of MARTA_LINES) {
    const runs = openRuns(orderLine(line, stations, edges), shutdown)
    runs.forEach((stops, run) => {
      const count = 1
      for (let n = 0; n < count; n += 1) {
        const forward = (now / LOOP_MS + n / count) % 1
        const backward = (1 - forward) % 1
        for (const [way, t] of [
          ['out', forward],
          ['back', backward],
        ] as const) {
          const at = along(stops, t)
          trains.push({ id: `${line}-${run}-${n}-${way}`, line, ...at })
        }
      }
    })
  }
  return trains
}

const EMOJI = (() => {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.font = '52px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('🚆', size / 2, size / 2 + 2)
  }
  return { url: canvas.toDataURL(), width: size, height: size, anchorX: size / 2, anchorY: size / 2 }
})()

export function createLiveTrainLayers(trains: SimTrain[]) {
  return [
    new IconLayer<SimTrain>({
      id: LIVE_TRAIN_LAYER,
      data: trains,
      getPosition: (d) => [d.longitude, d.latitude],
      getIcon: () => EMOJI,
      getSize: 22,
      sizeUnits: 'pixels',
      getColor: [255, 255, 255, 170],
      pickable: true,
    }),
  ]
}
