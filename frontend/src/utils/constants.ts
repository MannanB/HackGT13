import type { MartaLine } from '@/types/network'

export const MARTA_LINE_COLORS: Record<MartaLine, [number, number, number, number]> = {
  red: [227, 24, 55, 255],
  gold: [240, 180, 41, 255],
  blue: [29, 123, 214, 255],
  green: [22, 163, 74, 255],
}

export const MARTA_LINE_HEX: Record<MartaLine, string> = {
  red: '#e31837',
  gold: '#f0b429',
  blue: '#1d7bd6',
  green: '#16a34a',
}

export const IMPACT_BREAKS = [
  { min: 0, max: 5, label: '< 5', color: [246, 226, 122] as const, hex: '#f6e27a' },
  { min: 5, max: 15, label: '5 – 15', color: [240, 180, 41] as const, hex: '#f0b429' },
  { min: 15, max: 30, label: '15 – 30', color: [230, 122, 53] as const, hex: '#e67a35' },
  { min: 30, max: 45, label: '30 – 45', color: [212, 72, 58] as const, hex: '#d4483a' },
  { min: 45, max: Infinity, label: '> 45', color: [155, 29, 46] as const, hex: '#9b1d2e' },
] as const

export const ATLANTA_VIEW = {
  longitude: -84.39,
  latitude: 33.76,
  zoom: 11.15,
  pitch: 0,
  bearing: 0,
}

export const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

export function impactColor(delayMinutes: number, alpha = 160): [number, number, number, number] {
  const bucket = IMPACT_BREAKS.find((item) => delayMinutes >= item.min && delayMinutes < item.max)
  const color = bucket?.color ?? IMPACT_BREAKS[IMPACT_BREAKS.length - 1].color
  return [color[0], color[1], color[2], alpha]
}

export function formatMinutes(value: number | null): string {
  if (value === null) return '—'
  return `${Math.round(value)} min`
}

export function formatPopulation(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(value))
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}
