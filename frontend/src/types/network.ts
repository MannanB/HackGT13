export type MartaLine = 'red' | 'gold' | 'blue' | 'green'

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
