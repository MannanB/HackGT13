import type { HospitalCapacity, SimulationResult, ZoneImpact } from '@/types/simulation'
import { hourlyShare } from '@/utils/hourlyDemand'

const HORIZONS = [6, 12, 24] as const

export interface ForecastPoint {
  elapsedHour: number
  clockMinute: number
  arrivals: number
  delayedArrivals: number
  personMinutes: number
  beyond20: number
  beyond40: number
  beyond60: number
}

export interface HospitalForecast {
  poiId: string
  name: string
  capacity: number
  occupancy: number[]
  fullAtHour: number | null
  overflowAt24: number
}

export interface RankedBar {
  id: string
  name: string
  value: number
}

export interface CascadeStage {
  id: string
  label: string
  items: RankedBar[]
}

export interface Forecast {
  points: ForecastPoint[]
  horizons: ForecastPoint[]
  hospitals: HospitalForecast[]
  overflowRank: RankedBar[]
  communityRank: RankedBar[]
  overflowMeasuresLoad: boolean
  cascade: CascadeStage[]
  closurePersonMinutes: number
  withSitesPersonMinutes: number | null
}

function clockMinute(startMinute: number, elapsedHour: number) {
  return (startMinute + elapsedHour * 60) % 1440
}

function tripsAt(impact: ZoneImpact, fromMinute: number, toMinute: number) {
  const from = hourlyShare(impact.poiCategory, fromMinute)
  const to = hourlyShare(impact.poiCategory, toMinute)
  if (from <= 0) return to > 0 ? impact.estimatedTrips : 0
  return impact.estimatedTrips * (to / from)
}

function stayHours(hospital: HospitalCapacity) {
  return Math.max(1, (hospital.averageLengthOfStayDays ?? 5) * 24)
}

function hospitalPath(hospital: HospitalCapacity, startMinute: number, elapsedMinutes: number, nowMinute: number) {
  const capacity = hospital.capacity
  const baseline = hospital.baselineDemand
  if (capacity == null || baseline == null) return null
  const decay = Math.exp(-1 / stayHours(hospital))
  const surgeAt = (scale: number) => {
    let surge = 0
    const path = [0]
    for (let elapsed = 0; elapsed < 24; elapsed += 1) {
      const inflow = scale * hourlyShare('hospital', clockMinute(startMinute, elapsed))
      surge = surge * decay + inflow
      path.push(surge)
    }
    return path
  }
  const unit = surgeAt(1)
  const at = Math.max(0, Math.min(24, Math.round(elapsedMinutes / 60)))
  const observed = hospital.addedDemand
  let scale = 0
  if (observed > 0 && unit[at] > 1e-9) scale = observed / unit[at]
  else if (hospital.incomingAdmissionsPerHour > 0) {
    const nowShare = hourlyShare('hospital', nowMinute)
    scale = nowShare > 0 ? hospital.incomingAdmissionsPerHour / nowShare : hospital.incomingAdmissionsPerHour
  }
  const surge = surgeAt(scale)
  const occupancy = surge.map((stock) => baseline + stock)
  const fullIndex = occupancy.findIndex((value) => value >= capacity)
  return {
    poiId: hospital.poiId,
    name: hospital.poiName,
    capacity,
    occupancy,
    fullAtHour: fullIndex >= 0 ? fullIndex : null,
    overflowAt24: Math.max(0, occupancy[24] - capacity),
  }
}

export function buildForecast(input: {
  closure: SimulationResult
  addition: SimulationResult | null
  startMinute: number
  elapsedMinutes: number
  nowMinute: number
}): Forecast {
  const { closure, startMinute, nowMinute } = input
  const delayed = closure.zoneImpacts.filter((impact) => impact.delayMinutes > 0)
  const points: ForecastPoint[] = []
  for (let elapsedHour = 0; elapsedHour <= 24; elapsedHour += 1) {
    const minute = clockMinute(startMinute, elapsedHour)
    let arrivals = 0
    let delayedArrivals = 0
    let personMinutes = 0
    let beyond20 = 0
    let beyond40 = 0
    let beyond60 = 0
    for (const impact of closure.zoneImpacts) {
      const trips = tripsAt(impact, nowMinute, minute)
      arrivals += trips
      if (impact.delayMinutes <= 0) continue
      delayedArrivals += trips
      personMinutes += impact.delayMinutes * trips
      if (impact.disruptedTravelMinutes >= 20) beyond20 += trips
      if (impact.disruptedTravelMinutes >= 40) beyond40 += trips
      if (impact.disruptedTravelMinutes >= 60) beyond60 += trips
    }
    points.push({
      elapsedHour,
      clockMinute: minute,
      arrivals,
      delayedArrivals,
      personMinutes,
      beyond20,
      beyond40,
      beyond60,
    })
  }

  const hospitals = closure.hospitalCapacity
    .map((hospital) => hospitalPath(hospital, startMinute, input.elapsedMinutes, nowMinute))
    .filter((item): item is HospitalForecast => item != null)
    .sort((a, b) => b.overflowAt24 - a.overflowAt24 || (a.fullAtHour ?? 99) - (b.fullAtHour ?? 99))

  const communityRank = [...delayed]
    .map((impact) => ({
      id: impact.zoneId,
      name: impact.zoneName,
      value: impact.delayMinutes * tripsAt(impact, nowMinute, clockMinute(startMinute, 24)),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)

  const stationScores = new Map<string, { name: string; value: number }>()
  for (const impact of delayed) {
    const trace = closure.traces[impact.zoneId]
    const weight = impact.population
    for (const node of trace?.normalPath.nodes ?? []) {
      if (node.type !== 'station' || !node.failed) continue
      const current = stationScores.get(node.id)
      stationScores.set(node.id, {
        name: node.name,
        value: (current?.value ?? 0) + weight,
      })
    }
  }
  const stations = [...stationScores.entries()]
    .map(([id, score]) => ({ id, name: score.name, value: score.value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
  const communities = [...delayed]
    .sort((a, b) => b.delayMinutes * b.population - a.delayMinutes * a.population)
    .slice(0, 3)
    .map((impact) => ({
      id: impact.zoneId,
      name: impact.zoneName,
      value: impact.delayMinutes * impact.population,
    }))
  const facilities = closure.poiPressure.slice(0, 3).map((item) => ({
    id: item.poiId,
    name: item.poiName,
    value: item.addedDemand,
  }))

  const overflowing = hospitals.filter((item) => item.overflowAt24 > 0)
  const overflowRank = (overflowing.length > 0 ? overflowing : hospitals)
    .slice(0, 6)
    .map((item) => ({
      id: item.poiId,
      name: item.name,
      value: overflowing.length > 0 ? item.overflowAt24 : item.occupancy[24] / item.capacity,
    }))

  const closurePersonMinutes = delayed.reduce(
    (sum, impact) => sum + impact.delayMinutes * tripsAt(impact, nowMinute, clockMinute(startMinute, 24)),
    0,
  )
  const saved = input.addition?.zoneImpacts.reduce(
    (sum, impact) => sum + Math.max(0, impact.delayMinutes) * impact.estimatedTrips,
    0,
  )
  const withSitesPersonMinutes = saved == null ? null : Math.max(0, closurePersonMinutes - saved)

  return {
    points,
    horizons: HORIZONS.map((hour) => points[hour]),
    hospitals: hospitals.slice(0, 3),
    overflowRank,
    communityRank,
    overflowMeasuresLoad: overflowing.length === 0,
    cascade: [
      { id: 'stations', label: 'Stations', items: stations },
      { id: 'communities', label: 'Communities', items: communities },
      { id: 'facilities', label: 'Facilities', items: facilities },
    ].filter((stage) => stage.items.length > 0),
    closurePersonMinutes,
    withSitesPersonMinutes,
  }
}
