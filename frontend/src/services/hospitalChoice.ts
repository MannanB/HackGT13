import { apiGet, endpoints } from '@/services/api'

export interface HospitalChoiceModel {
  name: string
  kind: string
  trained: boolean
  features: string[]
  weights: number[]
  bias: number
  initialization?: string
  training?: {
    source?: string
    target?: string
    loss?: string
    rows?: number
    zips?: number
    hospitals?: number
    discharges?: number
  }
}

const FEATURES = ['travel_minutes', 'log_beds', 'occupancy'] as const

export function hospitalUtility(
  minutes: number,
  beds: number | null | undefined,
  occupancy: number | null | undefined,
  model: HospitalChoiceModel | null,
): number {
  if (!model) return -minutes
  const logBeds = beds != null && beds > 0 ? Math.log(beds) : 0
  const occupied = occupancy ?? 0
  return (
    model.weights[0] * minutes +
    model.weights[1] * logBeds +
    model.weights[2] * occupied +
    model.bias
  )
}

function isChoiceModel(value: HospitalChoiceModel): boolean {
  return (
    value.kind === 'conditional_logit' &&
    value.features.length === FEATURES.length &&
    FEATURES.every((feature, index) => value.features[index] === feature) &&
    value.weights.length === FEATURES.length &&
    value.weights.every((weight) => Number.isFinite(weight)) &&
    Number.isFinite(value.bias)
  )
}

export async function getHospitalChoiceModel(): Promise<HospitalChoiceModel | null> {
  const model = await apiGet<HospitalChoiceModel>(endpoints.hospitalChoiceModel)
  if (!isChoiceModel(model)) throw new Error('Hospital choice model response is not usable')
  return model
}
