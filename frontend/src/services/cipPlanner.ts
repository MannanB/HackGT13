import { categoryAccessByZone, findOptimalAdditionSite } from '@/services/accessSimulator'
import type { CipPlan, CipProject, ServiceGap } from '@/types/cip'
import type { PointOfInterest, PoiCategory, ResidentialZone } from '@/types/geography'
import type { Station, TransitEdge } from '@/types/network'
import type { PoiCriticalStation } from '@/types/simulation'
import { categorySingular } from '@/utils/categories'
import { categoryWeight } from '@/utils/categoryWeights'
import { facilityCost, formatUsd, sectorMeta, type CipSector } from '@/utils/facilityCosts'
import { haversineKm } from '@/utils/geo'
import { dailyZoneDemand } from '@/utils/hourlyDemand'

const MAX_PROJECTS = 6
const MAX_PER_CATEGORY = 2
const TOP_GAPS = 10

function equityMultiplier(zone: ResidentialZone) {
  let multiplier = 1
  if (zone.medianIncome != null && zone.medianIncome < 45_000) multiplier += 0.45
  else if (zone.medianIncome != null && zone.medianIncome < 65_000) multiplier += 0.2
  if (zone.households && zone.noVehicleHouseholds != null) {
    const share = zone.noVehicleHouseholds / zone.households
    if (share >= 0.18) multiplier += 0.35
    else if (share >= 0.1) multiplier += 0.15
  }
  if (zone.povertyPopulation && zone.povertyUniverse) {
    if (zone.povertyPopulation / zone.povertyUniverse >= 0.22) multiplier += 0.25
  }
  return multiplier
}

function nearestStation(point: { latitude: number; longitude: number }, stations: Station[]) {
  let best: Station | null = null
  let bestKm = Number.POSITIVE_INFINITY
  for (const station of stations) {
    const km = haversineKm(point, { latitude: station.latitude, longitude: station.longitude })
    if (km < bestKm) {
      best = station
      bestKm = km
    }
  }
  return best
}

function projectNoun(category: PoiCategory) {
  return categorySingular(category).toLowerCase()
}

function collectGaps(input: {
  zones: ResidentialZone[]
  pois: PointOfInterest[]
  stations: Station[]
  transitEdges: TransitEdge[]
  maintenanceStations: string[]
  shutdownStations: string[]
  poiCriticalById: Record<string, PoiCriticalStation>
  categories: PoiCategory[]
}): ServiceGap[] {
  const categories = input.categories
  const scoped = {
    zones: input.zones,
    pois: input.pois,
    stations: input.stations,
    transitEdges: input.transitEdges,
    serviceCategories: categories,
  }
  const open = categoryAccessByZone({
    ...scoped,
    maintenanceStations: [],
    shutdownStations: [],
  })
  const disrupted =
    input.maintenanceStations.length + input.shutdownStations.length > 0
      ? categoryAccessByZone({
          ...scoped,
          maintenanceStations: input.maintenanceStations,
          shutdownStations: input.shutdownStations,
        })
      : null

  const gaps: ServiceGap[] = []
  for (const zone of input.zones) {
    const row = open.get(zone.id)
    if (!row) continue
    for (const category of categories) {
      const access = row.get(category)
      if (!access) continue
      const stressed = disrupted?.get(zone.id)?.get(category)
      const extra = stressed ? Math.max(0, stressed.minutes - access.minutes) : 0
      const critical = input.poiCriticalById[access.poiId]
      const fragile = critical?.access[0] ?? critical?.pressure[0] ?? null
      const people = dailyZoneDemand(zone, category)
      const score =
        (access.minutes * people * categoryWeight(category) + extra * people * categoryWeight(category) * 1.6) *
        equityMultiplier(zone)
      const label = projectNoun(category)
      const incomeBit =
        zone.medianIncome != null
          ? ` Median household income is ${formatUsd(zone.medianIncome)}.`
          : ''
      const shockBit =
        extra >= 8
          ? ` Current station outages add about ${Math.round(extra)} minutes.`
          : fragile
            ? ` That trip is fragile if ${fragile.stationName} fails.`
            : ''
      gaps.push({
        zoneId: zone.id,
        zoneName: zone.name,
        category,
        travelMinutes: access.minutes,
        population: zone.population,
        demand: people,
        medianIncome: zone.medianIncome ?? null,
        fragileStationId: fragile?.stationId ?? null,
        fragileStationName: extra >= 8 ? null : (fragile?.stationName ?? null),
        disruptionExtraMinutes: extra,
        score,
        summary: `${zone.name} is ${Math.round(access.minutes)} minutes from the nearest ${label}.${shockBit}${incomeBit}`,
      })
    }
  }
  return gaps.sort((a, b) => b.score - a.score).slice(0, TOP_GAPS)
}

function gapBonus(category: PoiCategory, site: { latitude: number; longitude: number }, gaps: ServiceGap[], zones: ResidentialZone[]) {
  let bonus = 0
  for (const gap of gaps) {
    if (gap.category !== category) continue
    const zone = zones.find((item) => item.id === gap.zoneId)
    if (!zone) continue
    const km = haversineKm(site, zone.centroid)
    if (km <= 3.2) bonus += gap.score * (1 - km / 3.2) * 0.12
  }
  return bonus
}

function rationaleFor(project: {
  category: PoiCategory
  nearestStationName: string | null
  regionsHelped: number
  personMinutes: number
}, gaps: ServiceGap[]) {
  const noun = projectNoun(project.category)
  const local = gaps.filter((gap) => gap.category === project.category).slice(0, 2)
  const stationBit = project.nearestStationName ? ` near ${project.nearestStationName}` : ''
  const gapBit = local[0]
    ? ` It is aimed at ${local[0].zoneName}, where the nearest ${noun} is already a ${Math.round(local[0].travelMinutes)}-minute trip${
        local[0].fragileStationName ? ` and weakens if ${local[0].fragileStationName} closes` : ''
      }.`
    : ''
  return `Place a new ${noun}${stationBit} so ${project.regionsHelped} communities save at least 15 minutes on that trip.${gapBit} Modeled rider-minutes saved: ${Math.round(project.personMinutes).toLocaleString('en-US')}.`
}

export function planCapitalImprovements(input: {
  budget: number
  sector: CipSector
  zones: ResidentialZone[]
  pois: PointOfInterest[]
  stations: Station[]
  transitEdges: TransitEdge[]
  maintenanceStations: string[]
  shutdownStations: string[]
  poiCriticalById: Record<string, PoiCriticalStation>
  disruptionStationNames: string[]
}): CipPlan {
  const sector = sectorMeta(input.sector)
  const categories = sector.categories
  const maxPerCategory = categories.length === 1 ? MAX_PROJECTS : categories.length === 2 ? 3 : MAX_PER_CATEGORY
  const gaps = collectGaps({ ...input, categories })
  const occupied = input.pois.map((poi) => ({ latitude: poi.latitude, longitude: poi.longitude }))
  const inventory = [...input.pois]
  const projects: CipProject[] = []
  let remaining = input.budget
  let sequence = 0

  while (projects.length < MAX_PROJECTS) {
    const copies = (category: PoiCategory) => projects.filter((project) => project.category === category).length
    const affordable = categories.filter((category) => {
      if (facilityCost(category) > remaining) return false
      if (copies(category) >= maxPerCategory) {
        const alternative = categories.some(
          (other) => other !== category && facilityCost(other) <= remaining && copies(other) < maxPerCategory,
        )
        if (alternative) return false
      }
      return true
    })
    if (affordable.length === 0) break

    const gapNeed = new Map<PoiCategory, number>()
    for (const gap of gaps) {
      gapNeed.set(gap.category, (gapNeed.get(gap.category) ?? 0) + gap.score)
    }
    const ranked = [...affordable].sort(
      (a, b) => (gapNeed.get(b) ?? 0) - (gapNeed.get(a) ?? 0) || facilityCost(a) - facilityCost(b),
    )
    const tryCategories = ranked.slice(0, 4)

    let best: { category: PoiCategory; site: NonNullable<ReturnType<typeof findOptimalAdditionSite>>; efficiency: number } | null =
      null
    for (const category of tryCategories) {
      const site = findOptimalAdditionSite({
        category,
        zones: input.zones,
        pois: inventory,
        stations: input.stations,
        transitEdges: input.transitEdges,
        serviceCategories: categories,
        occupied,
        maintenanceStations: input.maintenanceStations,
        shutdownStations: input.shutdownStations,
        underservedLimit: 20,
        stationLimit: 16,
      })
      if (!site || site.regions === 0 || site.personMinutes <= 0) continue
      const cost = facilityCost(category)
      const novelty = copies(category) === 0 ? 1.22 : 1
      const efficiency =
        ((site.personMinutes * categoryWeight(category) + gapBonus(category, site, gaps, input.zones)) * novelty) / cost
      if (!best || efficiency > best.efficiency) best = { category, site, efficiency }
    }
    if (!best) break

    sequence += 1
    const cost = facilityCost(best.category)
    const noun = categorySingular(best.category)
    const station = nearestStation(best.site, input.stations)
    const project: CipProject = {
      id: `cip-${sequence}`,
      category: best.category,
      name: `Proposed ${noun} ${sequence}`,
      cost,
      longitude: best.site.longitude,
      latitude: best.site.latitude,
      nearestStationName: station?.name ?? null,
      regionsHelped: best.site.regions,
      personMinutes: best.site.personMinutes,
      rationale: '',
    }
    project.rationale = rationaleFor(project, gaps)
    projects.push(project)
    remaining -= cost
    occupied.push({ latitude: project.latitude, longitude: project.longitude })
    inventory.push({
      id: project.id,
      name: project.name,
      category: project.category,
      latitude: project.latitude,
      longitude: project.longitude,
    })
  }

  return {
    budget: input.budget,
    spent: input.budget - remaining,
    leftover: remaining,
    generatedAt: new Date().toISOString(),
    sector: sector.id,
    sectorLabel: sector.label,
    disruptionStationNames: input.disruptionStationNames,
    gaps,
    projects,
  }
}
