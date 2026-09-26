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
