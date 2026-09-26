import hourlyData from '@/data/hourlyDemandProfiles.json'
import type { PoiCategory, ResidentialZone } from '@/types/geography'

const profiles = hourlyData.profiles as Record<PoiCategory, number[]>

// National planning proxy requested for the movable, transit-dependent slice.
// The demographic uplifts are explicit modeling assumptions, not facility observations.
// CDC NHAMCS 2022: 47.3 ED visits per 100 people.
const EMERGENCY_VISITS_PER_PERSON_YEAR = 0.473
// CDC NHAMCS 2022: 11.5% of ED visits resulted in hospital admission.
const EMERGENCY_ADMISSION_SHARE = 0.115
// AHRQ MEPS 2024 reports about 340 million hospital outpatient visits nationally,
// approximately one visit per resident. These follow the daytime medical profile.
const OUTPATIENT_VISITS_PER_PERSON_YEAR = 1
const CHILD_UPLIFT = 0.25
const SENIOR_UPLIFT = 0.5
const DISABILITY_UPLIFT = 1
// 2020 Census Atlanta urban-area density. Dense block groups receive a bounded
// planning uplift; density is not treated as a clinical risk factor.
const ATLANTA_URBAN_DENSITY_PER_SQ_MI = 1_998
const MAX_DENSITY_UPLIFT = 2.5
const densityMultiplierCache = new WeakMap<ResidentialZone, number>()

export const DEFAULT_TIME_MINUTE = 12 * 60

export function hourAt(minuteOfDay: number): number {
  return Math.max(0, Math.min(23, Math.floor(minuteOfDay / 60)))
}

export function hourlyShare(category: PoiCategory, minuteOfDay: number): number {
  return profiles[category]?.[hourAt(minuteOfDay)] ?? 0
}

export function dailyZoneDemand(zone: ResidentialZone, category?: PoiCategory): number {
  if (category === 'employment' && zone.commuteJobs != null) return zone.commuteJobs
  const noVehicleResidents =
    zone.households && zone.noVehicleHouseholds != null
      ? (zone.noVehicleHouseholds / zone.households) * zone.population
      : 0
  if (zone.transitCommuters != null || zone.noVehicleHouseholds != null) {
    return Math.max(0, Math.round(Math.max(zone.transitCommuters ?? 0, noVehicleResidents)))
  }
  return zone.population
}

function ringAreaSqKm(ring: number[][]): number {
  if (ring.length < 3) return 0
  const latitude = zoneMeanLatitude(ring) * (Math.PI / 180)
  let twiceArea = 0
  for (let index = 0; index < ring.length; index += 1) {
    const [longitudeA, latitudeA] = ring[index]
    const [longitudeB, latitudeB] = ring[(index + 1) % ring.length]
    const xA = longitudeA * 111.32 * Math.cos(latitude)
    const yA = latitudeA * 110.57
    const xB = longitudeB * 111.32 * Math.cos(latitude)
    const yB = latitudeB * 110.57
    twiceArea += xA * yB - xB * yA
  }
  return Math.abs(twiceArea) / 2
}

function zoneMeanLatitude(ring: number[][]): number {
  return ring.reduce((sum, point) => sum + point[1], 0) / Math.max(1, ring.length)
}

function polygonAreaSqKm(rings: number[][][]): number {
  const [outer, ...holes] = rings
  if (!outer) return 0
  return Math.max(0, ringAreaSqKm(outer) - holes.reduce((sum, ring) => sum + ringAreaSqKm(ring), 0))
}

function zoneAreaSqMiles(zone: ResidentialZone): number {
  const coordinates = zone.geometry.coordinates
  const sqKm = zone.geometry.type === 'Polygon'
    ? polygonAreaSqKm(coordinates as number[][][])
    : (coordinates as number[][][][]).reduce(
        (sum, polygon) => sum + polygonAreaSqKm(polygon),
        0,
      )
  return sqKm * 0.386102
}

/** Bounded uplift for block groups denser than the Atlanta urban-area average. */
export function atlantaDensityMultiplier(zone: ResidentialZone): number {
  const cached = densityMultiplierCache.get(zone)
  if (cached != null) return cached
  const areaSqMiles = zoneAreaSqMiles(zone)
  const density = areaSqMiles > 0 ? zone.population / areaSqMiles : ATLANTA_URBAN_DENSITY_PER_SQ_MI
  const multiplier = Math.max(
    1,
    Math.min(MAX_DENSITY_UPLIFT, Math.sqrt(density / ATLANTA_URBAN_DENSITY_PER_SQ_MI)),
  )
  densityMultiplierCache.set(zone, multiplier)
  return multiplier
}

/** Expected daily ED patients from the transit-dependent population only. */
function riskAdjustedHospitalPopulation(zone: ResidentialZone): number {
  const transitDependent = dailyZoneDemand(zone, 'hospital')
  if (transitDependent <= 0) return 0
  const population = Math.max(1, zone.population)
  const riskMultiplier =
    1 +
    CHILD_UPLIFT * Math.max(0, zone.children ?? 0) / population +
    SENIOR_UPLIFT * Math.max(0, zone.seniors ?? 0) / population +
    DISABILITY_UPLIFT * Math.max(0, zone.disabledPopulation ?? 0) / population
  return transitDependent * riskMultiplier * atlantaDensityMultiplier(zone)
}

/** Expected daily hospital visitors from the transit-dependent population. */
export function hospitalDailyPatientDemand(zone: ResidentialZone): number {
  return riskAdjustedHospitalPopulation(zone) *
    ((EMERGENCY_VISITS_PER_PERSON_YEAR + OUTPATIENT_VISITS_PER_PERSON_YEAR) / 365)
}

/** Expected inpatient admissions originating in the selected clock hour. */
export function hourlyHospitalAdmissionDemand(
  zone: ResidentialZone,
  minuteOfDay: number,
): number {
  return riskAdjustedHospitalPopulation(zone) *
    (EMERGENCY_VISITS_PER_PERSON_YEAR / 365) *
    hourlyShare('hospital', minuteOfDay) *
    EMERGENCY_ADMISSION_SHARE
}

/** Modeled transit-dependent arrivals during the selected clock hour. */
export function hourlyZoneDemand(
  zone: ResidentialZone,
  category: PoiCategory,
  minuteOfDay: number,
): number {
  if (category === 'hospital') {
    const dailyPatients = hospitalDailyPatientDemand(zone)
    const totalAnnualRate = EMERGENCY_VISITS_PER_PERSON_YEAR + OUTPATIENT_VISITS_PER_PERSON_YEAR
    const blendedHourlyShare =
      (EMERGENCY_VISITS_PER_PERSON_YEAR * hourlyShare('hospital', minuteOfDay) +
        OUTPATIENT_VISITS_PER_PERSON_YEAR * hourlyShare('clinic', minuteOfDay)) /
      totalAnnualRate
    return dailyPatients * blendedHourlyShare
  }
  return dailyZoneDemand(zone, category) * hourlyShare(category, minuteOfDay)
}

/** Share of a daily profile accumulated from a clock start across an elapsed window. */
export function elapsedShare(category: PoiCategory, startMinute: number, elapsedMinutes: number): number {
  const profile = profiles[category]
  if (!profile) return 0
  let remaining = Math.max(0, Math.min(1440, elapsedMinutes))
  let clock = ((Math.round(startMinute) % 1440) + 1440) % 1440
  let share = 0
  while (remaining > 0) {
    const hour = Math.floor(clock / 60) % 24
    const available = 60 - (clock % 60)
    const slice = Math.min(remaining, available)
    share += (profile[hour] ?? 0) * (slice / 60)
    remaining -= slice
    clock = (clock + slice) % 1440
  }
  return share
}

/** Modeled arrivals from failure start through the elapsed closure, not one clock hour. */
export function aggregateZoneDemand(
  zone: ResidentialZone,
  category: PoiCategory,
  startMinute: number,
  elapsedMinutes: number,
): number {
  if (category === 'hospital') {
    const dailyPatients = hospitalDailyPatientDemand(zone)
    const totalAnnualRate = EMERGENCY_VISITS_PER_PERSON_YEAR + OUTPATIENT_VISITS_PER_PERSON_YEAR
    const blendedShare =
      (EMERGENCY_VISITS_PER_PERSON_YEAR * elapsedShare('hospital', startMinute, elapsedMinutes) +
        OUTPATIENT_VISITS_PER_PERSON_YEAR * elapsedShare('clinic', startMinute, elapsedMinutes)) /
      totalAnnualRate
    return dailyPatients * blendedShare
  }
  return dailyZoneDemand(zone, category) * elapsedShare(category, startMinute, elapsedMinutes)
}

export function formatTime(minuteOfDay: number): string {
  const bounded = Math.max(0, Math.min(1439, Math.round(minuteOfDay)))
  const hour = Math.floor(bounded / 60)
  const minute = bounded % 60
  const suffix = hour < 12 ? 'AM' : 'PM'
  const displayHour = hour % 12 || 12
  return `${displayHour}:${minute.toString().padStart(2, '0')} ${suffix}`
}
