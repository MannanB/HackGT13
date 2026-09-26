import { usesActivityModel } from '@/services/activityModel'
import type { PoiCategory } from '@/types/geography'

export const DEFAULT_CATEGORY_WEIGHTS: Record<PoiCategory, number> = {
  hospital: 10,
  clinic: 7,
  school: 5,
  government: 4,
  university: 3,
  grocery: 2,
  pharmacy: 2,
  employment: 2,
  library: 1,
  other: 1,
}

export function categoryWeight(category: PoiCategory): number {
  if (usesActivityModel()) return 1
  return DEFAULT_CATEGORY_WEIGHTS[category] ?? 1
}
