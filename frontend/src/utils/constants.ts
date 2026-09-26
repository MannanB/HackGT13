import type { MartaLine } from '@/types/network'

export type RGB = [number, number, number]
export type RGBA = [number, number, number, number]

export const MARTA_LINE_RGB: Record<MartaLine, RGB> = {
  red: [239, 68, 88],
  gold: [245, 190, 70],
  blue: [64, 150, 240],
  green: [52, 199, 120],
}

export const MARTA_LINES: MartaLine[] = ['red', 'gold', 'blue', 'green']

export function hex([r, g, b]: RGB): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
}

export const MARTA_LINE_HEX = Object.fromEntries(
  MARTA_LINES.map((line) => [line, hex(MARTA_LINE_RGB[line])]),
) as Record<MartaLine, string>

export const STATE_RGB = {
  maintenance: [245, 190, 70] as RGB,
  shutdown: [255, 77, 94] as RGB,
}

/** Closure-induced demand that moved to a different destination. */
export const SURGE_RGB: RGB = [255, 112, 92]

/** Reported beds are fully occupied at this point. */
export const HOSPITAL_MAX_LOAD = 1
export const MAX_CAPACITY_RGB: RGB = [255, 78, 96]
export const MAX_CAPACITY_RING_RGB: RGB = [255, 214, 160]

export const IMPACT_BREAKS: { min: number; max: number; label: string; color: RGB }[] = [
  { min: 0, max: 5, label: '< 5', color: [246, 226, 122] },
  { min: 5, max: 15, label: '5 – 15', color: [240, 180, 41] },
  { min: 15, max: 30, label: '15 – 30', color: [230, 122, 53] },
  { min: 30, max: 45, label: '30 – 45', color: [212, 72, 58] },
  { min: 45, max: Infinity, label: '> 45', color: [155, 29, 46] },
]

export function delayRgb(minutes: number): RGB {
  const bucket = IMPACT_BREAKS.find((item) => minutes >= item.min && minutes < item.max)
  return (bucket ?? IMPACT_BREAKS[IMPACT_BREAKS.length - 1]).color
}

export function delayHex(minutes: number): string {
  return hex(delayRgb(minutes))
}

export const MIN_ADDITION_GAIN_MINUTES = 15
export const TRANSFER_PENALTY_MINUTES = 4

let transferPenaltyMinutes = TRANSFER_PENALTY_MINUTES

export function getTransferPenaltyMinutes(): number {
  return transferPenaltyMinutes
}

export function setTransferPenaltyMinutes(minutes: number) {
  if (Number.isFinite(minutes) && minutes >= 0) transferPenaltyMinutes = minutes
}

export const GAIN_BREAKS: typeof IMPACT_BREAKS = [
  { min: 15, max: 25, label: '15 – 25', color: [60, 205, 110] },
  { min: 25, max: 40, label: '25 – 40', color: [30, 170, 95] },
  { min: 40, max: Infinity, label: '> 40', color: [15, 135, 80] },
]

export function gainRgb(minutes: number): RGB {
  const bucket = GAIN_BREAKS.find((item) => minutes >= item.min && minutes < item.max)
  return (bucket ?? GAIN_BREAKS[GAIN_BREAKS.length - 1]).color
}

export function gainHex(minutes: number): string {
  return hex(gainRgb(minutes))
}

export const ATLANTA_VIEW = {
  longitude: -84.4,
  latitude: 33.765,
  zoom: 10.9,
  pitch: 0,
  bearing: 0,
}

export const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json'

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
const full = new Intl.NumberFormat('en-US')

export function formatPopulation(value: number): string {
  return full.format(Math.round(value))
}

/** Keep small hourly arrival rates visible instead of rounding them to zero. */
export function formatVisitorRate(value: number): string {
  if (value === 0) return '0'
  if (value > 0 && value < 0.01) return '<0.01'
  if (value < 10) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)
  }
  return formatPopulation(value)
}

export function formatCompact(value: number): string {
  return compact.format(Math.round(value))
}
