export interface StationImpact {
  stationId: string
  stationName: string
  effect: 'shutdown' | 'maintenance'
  reason: string
}

export interface IntelEvent {
  title: string
  summary: string
  centerLatitude: number
  centerLongitude: number
  radiusKm: number
  evacuation?: boolean
  structuralDamage?: boolean
  severity?: number
  stationImpacts: StationImpact[]
  cascades: string[]
  recommendedRepairs: { stationId: string; stationName: string; why: string }[]
  recommendedFacilities: { category: string; reason: string }[]
}

export interface IntelInterpretation {
  narrative: string
  event: IntelEvent
}
