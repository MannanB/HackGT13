import type { PoiCategory } from '@/types/geography'
import type { CipSector } from '@/utils/facilityCosts'

export type { CipSector }

export interface ServiceGap {
  zoneId: string
  zoneName: string
  category: PoiCategory
  travelMinutes: number
  population: number
  demand: number
  medianIncome: number | null
  fragileStationId: string | null
  fragileStationName: string | null
  disruptionExtraMinutes: number
  score: number
  summary: string
}

export interface CipProject {
  id: string
  category: PoiCategory
  name: string
  cost: number
  longitude: number
  latitude: number
  nearestStationName: string | null
  regionsHelped: number
  personMinutes: number
  rationale: string
}

export interface CipPlan {
  budget: number
  spent: number
  leftover: number
  generatedAt: string
  sector: CipSector
  sectorLabel: string
  optimizeForLowIncome: boolean
  disruptionStationNames: string[]
  gaps: ServiceGap[]
  projects: CipProject[]
}
