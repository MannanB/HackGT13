import { apiGet, endpoints } from '@/services/api'
import type { PoiCategory, ResidentialZone } from '@/types/geography'
import { haversineKm, setWalkMetersPerMinute } from '@/utils/geo'
import { setTransferPenaltyMinutes } from '@/utils/constants'

export interface ActivityModel {
  name: string
  kind: string
  trained: boolean
  features: string[]
  featureMean: number[]
  featureScale: number[]
  downtown: { latitude: number; longitude: number }
  medianIncomeImpute: number
  categories: PoiCategory[]
  bias: number[]
  sensitivity: number[]
  makeupWeights: number[]
  meanTripsPerPerson: number[]
  walkMetersPerMinute: number
  transferPenaltyMinutes: number
}

const FEATURES = [
  'worker_share',
  'employed_share',
  'transit_share',
  'limited_english_share',
  'log_income',
  'jobs_per_resident',
  'km_to_downtown',
] as const

let active: ActivityModel | null = null

export function usesActivityModel(): boolean {
  return active != null
}

export function activityFingerprint(): string {
  if (!active) return 'hand-constants'
  return `day:${active.walkMetersPerMinute}:${active.transferPenaltyMinutes}:${active.bias.join(',')}:${active.trained}`
}

function softplus(value: number): number {
  if (value > 20) return value
  if (value < -20) return Math.exp(value)
  return Math.log1p(Math.exp(value))
}

function share(part: number | null | undefined, whole: number): number {
  if (!whole || part == null || part <= 0) return 0
  return part / whole
}

function featuresOf(zone: ResidentialZone, model: ActivityModel): number[] {
  const population = Math.max(zone.population, 1)
  const englishUniverse = zone.limitedEnglishUniverse ?? 0
  const income = zone.medianIncome && zone.medianIncome > 0 ? zone.medianIncome : model.medianIncomeImpute
  const raw = [
    share(zone.workers, population),
    share(zone.employedPopulation, population),
    share(zone.transitCommuters, population),
    englishUniverse > 0 ? share(zone.limitedEnglishHouseholds, englishUniverse) : 0,
    Math.log(income),
    share(zone.commuteJobs, population),
    haversineKm(zone.centroid, model.downtown),
  ]
  return raw.map((value, index) => (value - model.featureMean[index]) / model.featureScale[index])
}

export function dailyActivityTrips(zone: ResidentialZone, category: PoiCategory): number | null {
  if (!active || zone.population <= 0) return null
  const index = active.categories.indexOf(category)
  if (index < 0) return null
  const features = featuresOf(zone, active)
  const score = features.reduce((sum, value, feature) => sum + value * active!.makeupWeights[feature], 0)
  const rate = softplus(active.bias[index] + active.sensitivity[index] * score)
  return zone.population * rate
}

function isActivityModel(value: ActivityModel): boolean {
  return (
    value.trained === true &&
    value.kind === 'activity_rate' &&
    value.features.length === FEATURES.length &&
    FEATURES.every((feature, index) => value.features[index] === feature) &&
    value.categories.length > 0 &&
    value.bias.length === value.categories.length &&
    value.sensitivity.length === value.categories.length &&
    value.makeupWeights.length === FEATURES.length &&
    value.featureMean.length === FEATURES.length &&
    value.featureScale.length === FEATURES.length &&
    value.featureScale.every((scale) => scale > 0) &&
    Number.isFinite(value.walkMetersPerMinute) &&
    value.walkMetersPerMinute > 0 &&
    Number.isFinite(value.transferPenaltyMinutes) &&
    value.transferPenaltyMinutes >= 0 &&
    Number.isFinite(value.downtown?.latitude) &&
    Number.isFinite(value.downtown?.longitude) &&
    Number.isFinite(value.medianIncomeImpute) &&
    value.medianIncomeImpute > 0
  )
}

export function setActivityModel(model: ActivityModel | null) {
  active = model
  if (!model) return
  setWalkMetersPerMinute(model.walkMetersPerMinute)
  setTransferPenaltyMinutes(model.transferPenaltyMinutes)
}

export async function getActivityModel(): Promise<ActivityModel | null> {
  const model = await apiGet<ActivityModel>(endpoints.activityModel)
  if (!isActivityModel(model)) throw new Error('Activity model response is not usable')
  return model
}
