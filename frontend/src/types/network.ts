export type MartaLine = 'red' | 'gold' | 'blue' | 'green'

export type StationOperatingState = 'normal' | 'maintenance' | 'shutdown'

export const STATION_STATE_OPTIONS: {
  value: StationOperatingState
  label: string
  detail: string
}[] = [
  {
    value: 'normal',
    label: 'Normal',
    detail: 'Trains stop here and riders board as usual.',
  },
  {
    value: 'maintenance',
    label: 'Maintenance',
    detail: 'No boarding here, but trains still run through.',
  },
  {
    value: 'shutdown',
    label: 'Shut down',
    detail: 'No boarding, and the line is cut at this station.',
  },
]

export interface Station {
  id: string
  name: string
  latitude: number
  longitude: number
  lines: MartaLine[]
  isActive: boolean
}

export interface TransitEdge {
  id: string
  fromStation: string
  toStation: string
  travelMinutes: number
  line: MartaLine
  frequencyMinutes: number
}

export interface AccessEdge {
  id: string
  locationType: 'zone' | 'poi'
  locationId: string
  stationId: string
  walkingMinutes: number
}

export function mapMartaLine(value: string): MartaLine | null {
  const line = value.toLowerCase()
  if (line === 'red' || line === 'gold' || line === 'blue' || line === 'green') {
    return line
  }
  return null
}
