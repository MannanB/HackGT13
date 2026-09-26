import type { PoiCategory } from '@/types/geography'
import { SERVICE_CATEGORIES } from '@/utils/categories'

/** Planning-level capital allowances (not bid estimates). */
export const FACILITY_COST: Record<PoiCategory, number> = {
  clinic: 900_000,
  grocery: 2_400_000,
  library: 4_800_000,
  school: 12_000_000,
  government: 16_000_000,
  university: 38_000_000,
  hospital: 62_000_000,
  pharmacy: 1_800_000,
  employment: 22_000_000,
  other: 5_000_000,
}

export const CIP_CATEGORIES: PoiCategory[] = SERVICE_CATEGORIES.map((item) => item.category)

export const CIP_BUDGET_MIN = 1_000_000
export const CIP_BUDGET_MAX = 100_000_000

export function cheapestFacilityCost() {
  return Math.min(...CIP_CATEGORIES.map((category) => FACILITY_COST[category]))
}

export function facilityCost(category: PoiCategory) {
  return FACILITY_COST[category] ?? FACILITY_COST.other
}

export function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Math.round(value))
}

export function formatBudgetMillions(value: number) {
  const millions = value / 1_000_000
  const digits = millions >= 10 || Number.isInteger(millions) ? 0 : 1
  return `$${millions.toFixed(digits)} million`
}

export function budgetFromSlider(unit: number) {
  const t = Math.min(1, Math.max(0, unit))
  const logMin = Math.log(CIP_BUDGET_MIN)
  const logMax = Math.log(CIP_BUDGET_MAX)
  const raw = Math.exp(logMin + t * (logMax - logMin))
  return Math.round(raw / 50_000) * 50_000
}

export function sliderFromBudget(value: number) {
  const clamped = Math.min(CIP_BUDGET_MAX, Math.max(CIP_BUDGET_MIN, value))
  const logMin = Math.log(CIP_BUDGET_MIN)
  const logMax = Math.log(CIP_BUDGET_MAX)
  return (Math.log(clamped) - logMin) / (logMax - logMin)
}
