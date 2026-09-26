import { mapMartaLine, type MartaLine } from '@/types/network'

export interface LiveTrain {
  id: string
  line: MartaLine
  destination: string
  nextStation: string
  direction: string
  latitude: number
  longitude: number
  waitingSeconds: number
  /** Degrees clockwise from north. The icon points along this. */
  heading: number
}

interface TrainSample {
  at: number
  trains: LiveTrain[]
}

interface ApiTrain {
  id: string
  line: string
  destination: string
  nextStation: string
  latitude: number
  longitude: number
  direction: string
  waitingSeconds: number
}

const COMPASS_HEADING: Record<string, number> = { N: 0, E: 90, S: 180, W: 270 }

function headingBetween(from: LiveTrain | undefined, train: { latitude: number; longitude: number; direction: string }): number {
  if (from) {
    const dLat = train.latitude - from.latitude
    const dLng = train.longitude - from.longitude
    if (dLat * dLat + dLng * dLng > 1e-11) return (Math.atan2(dLng, dLat) * 180) / Math.PI
    if (Number.isFinite(from.heading)) return from.heading
  }
  return COMPASS_HEADING[train.direction] ?? 0
}

export async function fetchLiveTrains(): Promise<LiveTrain[]> {
  const response = await fetch('/api/v1/live/trains')
  if (!response.ok) throw new Error(`Live trains failed (${response.status})`)
  const data = (await response.json()) as { trains: ApiTrain[] }
  return data.trains.flatMap((train) => {
    const line = mapMartaLine(train.line)
    if (!line) return []
    return [
      {
        id: train.id,
        line,
        destination: train.destination,
        nextStation: train.nextStation.replace(/ station$/i, ''),
        direction: train.direction,
        heading: COMPASS_HEADING[train.direction] ?? 0,
        latitude: train.latitude,
        longitude: train.longitude,
        waitingSeconds: train.waitingSeconds,
      },
    ]
  })
}

/** Glide each train from the previous GPS fix toward the latest one. */
export function interpolateTrains(previous: TrainSample | null, latest: TrainSample, now: number): LiveTrain[] {
  if (!previous) return latest.trains
  const span = Math.max(1, latest.at - previous.at)
  const t = Math.min(1, Math.max(0, (now - latest.at) / span))
  const before = new Map(previous.trains.map((train) => [train.id, train]))
  return latest.trains.map((train) => {
    const from = before.get(train.id)
    if (!from) return { ...train, heading: headingBetween(undefined, train) }
    return {
      ...train,
      latitude: from.latitude + (train.latitude - from.latitude) * t,
      longitude: from.longitude + (train.longitude - from.longitude) * t,
      heading: headingBetween(from, train),
    }
  })
}
