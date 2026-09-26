import { create } from 'zustand'
import { downloadCipPdf } from '@/services/cipPdf'
import { planCapitalImprovements } from '@/services/cipPlanner'
import {
  buildAccessSimulation,
  buildAdditionSimulation,
  createPoiCriticalIndex,
  findOptimalAdditionSite,
} from '@/services/accessSimulator'
import { getActivityModel, setActivityModel } from '@/services/activityModel'
import type { CipPlan } from '@/types/cip'
import type { CipSector } from '@/utils/facilityCosts'
import {
  networkFingerprint,
  readCriticalCache,
  writeCriticalCache,
} from '@/services/criticalCache'
import {
  attachAccess,
  attachExperimental,
  getAccessEdges,
  getExperimentalContext,
  getPointsOfInterest,
  getStreetRoutes,
  getZones,
} from '@/services/geoService'
import { getNetwork } from '@/services/stationService'
import type { PointOfInterest, PoiCategory, ResidentialZone, StreetRouteMap } from '@/types/geography'
import type { Station, StationOperatingState, TransitEdge } from '@/types/network'
import type {
  EvacuationZone,
  PoiCriticalStation,
  RouteView,
  SimulationResult,
  TraceImpact,
} from '@/types/simulation'
import { haversineKm } from '@/utils/geo'
import type { IntelEvent } from '@/types/intelligence'
import { DEFAULT_TIME_MINUTE, DEFAULT_FAILURE_ELAPSED_MINUTES } from '@/utils/hourlyDemand'

type LoadStatus = 'loading' | 'ready' | 'error'
export type AppMode = 'disrupt' | 'add' | 'intel' | 'build'

interface FocusRequest {
  bounds: [[number, number], [number, number]]
  key: number
}

interface ScenarioState {
  appMode: AppMode
  addedPois: PointOfInterest[]
  mapCenter: { longitude: number; latitude: number }
  loadStatus: LoadStatus
  loadError: string | null
  stations: Station[]
  transitEdges: TransitEdge[]
  zones: ResidentialZone[]
  pois: PointOfInterest[]
  streetRoutes: StreetRouteMap

  stationStates: Record<string, StationOperatingState>
  /** Destinations that are shut down. */
  closedPoiIds: Record<string, true>
  /** Destinations destroyed by an intelligence disaster event. */
  destroyedPoiIds: Record<string, true>
  evacuation: EvacuationZone | null
  selectedStationId: string | null
  hoveredStationId: string | null
  selectedServiceCategories: PoiCategory[]
  failureStartMinute: number
  failureElapsedMinutes: number
  timeMinute: number

  result: SimulationResult | null
  disruptionResult: SimulationResult | null
  /** Access gains from destinations placed in Plan. Stays on the map in every tab. */
  additionResult: SimulationResult | null
  computing: boolean
  simulationError: string | null

  selectedZoneId: string | null
  hoveredZoneId: string | null
  delayRange: [number, number] | null
  routeView: RouteView
  extruded: boolean
  focusRequest: FocusRequest | null
  poiCriticalById: Record<string, PoiCriticalStation>
  /** Fraction of stations already tested for the per-facility critical index. */
  poiCriticalProgress: number
  intelEvent: IntelEvent | null
  intelNarrative: string | null
  criticalFromCache: boolean
  cipBudget: number
  cipSector: CipSector
  cipOptimizeLowIncome: boolean
  cipPlan: CipPlan | null
  cipStatus: string | null

  setAppMode: (mode: AppMode) => void
  setCipBudget: (budget: number) => void
  setCipSector: (sector: CipSector) => void
  setCipOptimizeLowIncome: (value: boolean) => void
  generateCipPlan: () => void
  downloadCip: () => void
  setMapCenter: (longitude: number, latitude: number) => void
  addPoi: (category: PoiCategory, label: string) => void
  placeOptimalPoi: (category: PoiCategory, label: string) => void
  movePoi: (id: string, longitude: number, latitude: number) => void
  removePoi: (id: string) => void
  loadNetwork: () => Promise<void>
  selectStation: (id: string | null) => void
  hoverStation: (id: string | null) => void
  setStationState: (id: string, status: StationOperatingState) => void
  resetStationStates: () => void
  togglePoiClosed: (id: string) => void
  toggleServiceCategory: (category: PoiCategory) => void
  setFailureStartMinute: (minute: number) => void
  setFailureElapsedMinutes: (minute: number) => void
  selectZone: (zoneId: string | null) => void
  hoverZone: (zoneId: string | null) => void
  setDelayRange: (range: [number, number] | null) => void
  setRouteView: (view: RouteView) => void
  setExtruded: (extruded: boolean) => void
  applyIntelEvent: (event: IntelEvent, narrative: string) => void
  clearIntelEvent: () => void
}

const DEFAULT_CATEGORIES: PoiCategory[] = ['government', 'hospital', 'grocery']
const CRITICAL_PUBLISH_EVERY = 4

/** Deterministic 0–1 value so the same event always destroys the same facilities. */
function stableUnit(key: string) {
  let hash = 2166136261
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967296
}

function allDestinations(state: Pick<ScenarioState, 'pois' | 'addedPois' | 'selectedServiceCategories'>) {
  const pois = [...state.pois, ...state.addedPois]
  const serviceCategories = [
    ...new Set([...state.selectedServiceCategories, ...state.addedPois.map((poi) => poi.category)]),
  ]
  return { pois, serviceCategories }
}

/** Plain-language snapshot of the live scenario, sent to the AI so follow-ups build on it. */
export function describeScenario(state: ScenarioState): string {
  const names = new Map(state.stations.map((station) => [station.id, station.name]))
  const poiNames = new Map([...state.pois, ...state.addedPois].map((poi) => [poi.id, poi.name]))
  const lines: string[] = []
  const event = state.intelEvent
  if (event) {
    lines.push(
      `Active event: ${event.title} at ${event.centerLatitude.toFixed(4)},${event.centerLongitude.toFixed(4)}, radius ${event.radiusKm.toFixed(1)} km.`,
    )
  }
  const stationLines = Object.entries(state.stationStates)
    .filter(([, status]) => status !== 'normal')
    .map(([id, status]) => `- ${id} | ${names.get(id) ?? id} | ${status}`)
  lines.push(
    stationLines.length
      ? `Disrupted stations (id | name | state):\n${stationLines.join('\n')}`
      : 'All stations are operating normally.',
  )
  const closed = Object.keys(state.closedPoiIds).map((id) => poiNames.get(id) ?? id)
  if (closed.length) lines.push(`Destinations shut down by the user: ${closed.join(', ')}.`)
  const destroyed = Object.keys(state.destroyedPoiIds).map((id) => poiNames.get(id) ?? id)
  if (destroyed.length) lines.push(`Destinations destroyed: ${destroyed.join(', ')}.`)
  if (state.evacuation) lines.push(`Evacuation in effect, severity ${state.evacuation.severity}/5.`)
  const summary = state.disruptionResult?.summary
  if (summary) {
    lines.push(
      `Current impact: ${Math.round(summary.populationAffected).toLocaleString()} residents affected, +${summary.averageAddedTravelMinutes.toFixed(1)} min average travel.`,
    )
  }
  const full = (state.disruptionResult?.hospitalCapacity ?? [])
    .filter((item) => item.loadRatio != null && item.loadRatio >= 1)
    .map((item) => item.poiName)
  if (full.length) lines.push(`Hospitals over capacity: ${full.join(', ')}.`)
  return lines.join('\n')
}

export function selectTrace(state: ScenarioState): TraceImpact | null {
  if (!state.selectedZoneId) return null
  return (
    state.result?.traces[state.selectedZoneId] ??
    state.disruptionResult?.traces[state.selectedZoneId] ??
    null
  )
}

function disruptionLists(stationStates: Record<string, StationOperatingState>) {
  const maintenanceStations: string[] = []
  const shutdownStations: string[] = []
  for (const [id, status] of Object.entries(stationStates)) {
    if (status === 'maintenance') maintenanceStations.push(id)
    if (status === 'shutdown') shutdownStations.push(id)
  }
  return { maintenanceStations, shutdownStations }
}

let impactGeneration = 0
let criticalGeneration = 0

export const useScenarioStore = create<ScenarioState>((set, get) => {
  const clearImpacts = () => {
    impactGeneration += 1
    set({
      computing: false,
      result: null,
      disruptionResult: null,
      simulationError: null,
      selectedZoneId: null,
      delayRange: null,
    })
  }

  /** Drops shutdown colors, then measures any Plan destination against the restored network. */
  const clearDisruptionOnly = () => {
    const hasPlan = get().addedPois.length > 0
    clearImpacts()
    if (!hasPlan) {
      set({ additionResult: null })
      return
    }
    recomputeAddition()
  }

  const hasDisruption = () => {
    const { stationStates, closedPoiIds, destroyedPoiIds, evacuation } = get()
    return (
      Object.keys(stationStates).length + Object.keys(closedPoiIds).length + Object.keys(destroyedPoiIds).length >
        0 || evacuation != null
    )
  }

  /** Keeps the active intelligence event in step with manual edits made elsewhere in the app. */
  const syncIntelEvent = () => {
    const { intelEvent, stationStates, stations, destroyedPoiIds, evacuation } = get()
    if (!intelEvent) return
    const previous = new Map(intelEvent.stationImpacts.map((impact) => [impact.stationId, impact]))
    const names = new Map(stations.map((station) => [station.id, station.name]))
    const stationImpacts = Object.entries(stationStates)
      .filter((entry): entry is [string, 'shutdown' | 'maintenance'] => entry[1] !== 'normal')
      .map(([stationId, effect]) => {
        const prior = previous.get(stationId)
        return {
          stationId,
          stationName: prior?.stationName ?? names.get(stationId) ?? stationId,
          effect,
          reason: prior && prior.effect === effect ? prior.reason : 'Set manually in the Disrupt tab',
        }
      })
    const nothingLeft =
      stationImpacts.length === 0 && Object.keys(destroyedPoiIds).length === 0 && !evacuation
    if (nothingLeft) {
      set({ intelEvent: null, intelNarrative: null })
      return
    }
    set({
      intelEvent: {
        ...intelEvent,
        stationImpacts,
        recommendedRepairs: intelEvent.recommendedRepairs.filter((item) => stationStates[item.stationId]),
      },
    })
  }

  const runDisruption = (refreshPlan = false) => {
    const { maintenanceStations, shutdownStations } = disruptionLists(get().stationStates)
    if (!hasDisruption()) {
      clearDisruptionOnly()
      return
    }
    const generation = ++impactGeneration
    set({ computing: true })
    window.setTimeout(() => {
      if (generation !== impactGeneration) return
      const state = get()
      if (
        Object.keys(state.stationStates).length +
          Object.keys(state.closedPoiIds).length +
          Object.keys(state.destroyedPoiIds).length ===
          0 &&
        state.evacuation == null
      ) {
        clearDisruptionOnly()
        return
      }
      try {
        const destinations = allDestinations(state)
        const result = buildAccessSimulation({
          maintenanceStations,
          shutdownStations,
          serviceCategories: destinations.serviceCategories,
          zones: state.zones,
          pois: destinations.pois,
          stations: state.stations,
          transitEdges: state.transitEdges,
          timeMinute: state.timeMinute,
          failureStartMinute: state.failureStartMinute,
          failureElapsedMinutes: state.failureElapsedMinutes,
          closedPoiIds: [...Object.keys(state.closedPoiIds), ...Object.keys(state.destroyedPoiIds)],
          evacuation: state.evacuation,
        })
        const keepZone = state.selectedZoneId && result.traces[state.selectedZoneId]
        const adding = state.appMode === 'add'
        set({
          computing: adding && state.addedPois.length > 0,
          disruptionResult: result,
          result: adding ? (state.addedPois.length > 0 ? state.result : null) : result,
          simulationError: null,
          selectedZoneId: adding ? state.selectedZoneId : keepZone ? state.selectedZoneId : null,
        })
        if (refreshPlan && get().addedPois.length > 0) recomputeAddition()
        else if (get().addedPois.length === 0) set({ additionResult: null })
      } catch (error) {
        set({
          computing: false,
          result: get().appMode === 'add' ? get().result : null,
          disruptionResult: null,
          selectedZoneId: get().appMode === 'add' ? get().selectedZoneId : null,
          simulationError: error instanceof Error ? error.message : 'Simulation failed',
        })
      }
    }, 16)
  }

  const recompute = (refreshPlan = false) => {
    if (!hasDisruption()) {
      clearDisruptionOnly()
      return
    }
    runDisruption(refreshPlan)
  }

  const recomputeAddition = () => {
    const state = get()
    if (state.addedPois.length === 0) {
      impactGeneration += 1
      set({
        computing: false,
        additionResult: null,
        ...(state.appMode === 'add' ? { result: null, selectedZoneId: null } : {}),
        simulationError: null,
      })
      return
    }
    const generation = ++impactGeneration
    set({ computing: true })
    window.requestAnimationFrame(() => {
      if (generation !== impactGeneration) return
      const latest = get()
      if (latest.addedPois.length === 0) {
        set({
          computing: false,
          additionResult: null,
          ...(latest.appMode === 'add' ? { result: null, selectedZoneId: null } : {}),
        })
        return
      }
      const { maintenanceStations, shutdownStations } = disruptionLists(latest.stationStates)
      try {
        const result = buildAdditionSimulation({
          addedPois: latest.addedPois,
          serviceCategories: latest.selectedServiceCategories,
          zones: latest.zones,
          pois: latest.pois,
          stations: latest.stations,
          transitEdges: latest.transitEdges,
          maintenanceStations,
          shutdownStations,
          timeMinute: latest.timeMinute,
          failureStartMinute: latest.failureStartMinute,
          failureElapsedMinutes: latest.failureElapsedMinutes,
        })
        const keepZone = latest.selectedZoneId && result.traces[latest.selectedZoneId]
        const onPlan = latest.appMode === 'add'
        set({
          computing: false,
          additionResult: result,
          simulationError: null,
          ...(onPlan
            ? { result, selectedZoneId: keepZone ? latest.selectedZoneId : null }
            : {}),
        })
      } catch (error) {
        set({
          computing: false,
          additionResult: null,
          ...(get().appMode === 'add' ? { result: null, selectedZoneId: null } : {}),
          simulationError: error instanceof Error ? error.message : 'Simulation failed',
        })
      }
    })
  }

  let poiSequence = 0

  return {
    appMode: 'disrupt',
    addedPois: [],
    mapCenter: { longitude: -84.39, latitude: 33.755 },
    loadStatus: 'loading',
    loadError: null,
    stations: [],
    transitEdges: [],
    zones: [],
    pois: [],
    streetRoutes: {},

    stationStates: {},
    closedPoiIds: {},
    destroyedPoiIds: {},
    evacuation: null,
    selectedStationId: null,
    hoveredStationId: null,
    selectedServiceCategories: DEFAULT_CATEGORIES,
    failureStartMinute: DEFAULT_TIME_MINUTE,
    failureElapsedMinutes: DEFAULT_FAILURE_ELAPSED_MINUTES,
    timeMinute: DEFAULT_TIME_MINUTE,

    result: null,
    disruptionResult: null,
    additionResult: null,
    computing: false,
    simulationError: null,

    selectedZoneId: null,
    hoveredZoneId: null,
    delayRange: null,
    routeView: 'both',
    extruded: false,
    focusRequest: null,
    poiCriticalById: {},
    poiCriticalProgress: 0,
    intelEvent: null,
    intelNarrative: null,
    criticalFromCache: false,
    cipBudget: 10_000_000,
    cipSector: 'general',
    cipOptimizeLowIncome: false,
    cipPlan: null,
    cipStatus: null,

    loadNetwork: async () => {
      criticalGeneration += 1
      const alreadyShowingMap = get().stations.length > 0
      if (!alreadyShowingMap) {
        set({ loadStatus: 'loading', loadError: null, poiCriticalById: {}, poiCriticalProgress: 0, criticalFromCache: false })
      }
      try {
        const [network, zones, pois, accessEdges, experimental, streetRoutes, activity] = await Promise.all([
          getNetwork(),
          getZones(),
          getPointsOfInterest(),
          getAccessEdges(),
          getExperimentalContext(),
          getStreetRoutes(),
          getActivityModel().catch((error: unknown) => {
            console.warn('Activity model unavailable', error)
            return null
          }),
        ])
        setActivityModel(activity)
        const enriched = attachExperimental(zones, pois, experimental)
        const connected = attachAccess(enriched.zones, enriched.pois, accessEdges)
        const fingerprint = networkFingerprint({
          stations: network.stations,
          transitEdges: network.transitEdges,
          zones: connected.zones,
          pois: connected.pois,
        })
        const cached = await readCriticalCache(fingerprint)
        const previous = get().poiCriticalById
        const seed = cached ?? (Object.keys(previous).length > 0 ? previous : null)
        set({
          stations: network.stations,
          transitEdges: network.transitEdges,
          zones: connected.zones,
          pois: connected.pois,
          streetRoutes,
          selectedStationId:
            get().selectedStationId ??
            network.stations.find((station) => /five points/i.test(station.name))?.id ??
            null,
          loadStatus: 'ready',
          poiCriticalById: seed ?? {},
          poiCriticalProgress: seed ? 1 : 0,
          criticalFromCache: Boolean(cached),
        })
        // Persist the last snapshot under the new fingerprint so a reload does not
        // start the overlay from scratch after a Build add/remove.
        if (!cached && seed) await writeCriticalCache(fingerprint, seed)
        if (!cached) {
          const generation = ++criticalGeneration
          const index = createPoiCriticalIndex({
            zones: connected.zones,
            pois: connected.pois,
            stations: network.stations,
            transitEdges: network.transitEdges,
          })
          const total = index.stations.length
          let cursor = 0
          const step = () => {
            if (generation !== criticalGeneration) return
            if (cursor < total) {
              index.absorb(index.stations[cursor])
              cursor += 1
            }
            const done = cursor >= total
            const snapshot = done || cursor % CRITICAL_PUBLISH_EVERY === 0 ? index.snapshot() : null
            set({
              poiCriticalProgress: total ? cursor / total : 1,
              ...(snapshot ? { poiCriticalById: snapshot } : {}),
            })
            if (done && snapshot) void writeCriticalCache(fingerprint, snapshot)
            if (!done) window.requestAnimationFrame(step)
          }
          window.requestAnimationFrame(step)
        }
        recompute()
      } catch (error) {
        set({
          loadStatus: 'error',
          loadError: error instanceof Error ? error.message : 'Failed to load network',
        })
      }
    },

    setAppMode: (appMode) => {
      if (get().appMode === appMode) return
      if (appMode === 'intel') {
        set({ appMode })
        return
      }
      if (appMode === 'add') {
        set({
          appMode,
          selectedZoneId: null,
          result: get().addedPois.length > 0 ? get().result : null,
        })
        recompute()
        return
      }
      set({ appMode, selectedZoneId: null })
      recompute()
    },

    setMapCenter: (longitude, latitude) => set({ mapCenter: { longitude, latitude } }),

    setCipBudget: (cipBudget) => set({ cipBudget }),

    setCipSector: (cipSector) => set({ cipSector }),

    setCipOptimizeLowIncome: (cipOptimizeLowIncome) => set({ cipOptimizeLowIncome }),

    generateCipPlan: () => {
      const generation = ++impactGeneration
      set({ computing: true, cipStatus: null })
      window.setTimeout(() => {
        if (generation !== impactGeneration) return
        const state = get()
        const { maintenanceStations, shutdownStations } = disruptionLists(state.stationStates)
        const disruptionStationNames = [...maintenanceStations, ...shutdownStations]
          .map((id) => state.stations.find((station) => station.id === id)?.name)
          .filter((name): name is string => Boolean(name))
        try {
          const plan = planCapitalImprovements({
            budget: state.cipBudget,
            sector: state.cipSector,
            optimizeForLowIncome: state.cipOptimizeLowIncome,
            zones: state.zones,
            pois: state.pois,
            stations: state.stations,
            transitEdges: state.transitEdges,
            maintenanceStations,
            shutdownStations,
            poiCriticalById: state.poiCriticalById,
            disruptionStationNames,
          })
          if (plan.projects.length === 0) {
            set({
              computing: false,
              cipPlan: plan,
              cipStatus: 'Nothing in this sector both fits this budget and saves at least 15 minutes. Raise the budget or fail a station first.',
            })
            return
          }
          const addedPois = plan.projects.map((project) => ({
            id: project.id,
            name: project.name,
            category: project.category,
            latitude: project.latitude,
            longitude: project.longitude,
          }))
          set({ addedPois, cipPlan: plan, cipStatus: null })
          recompute(true)
        } catch (error) {
          set({
            computing: false,
            cipStatus: error instanceof Error ? error.message : 'Could not build a capital plan',
          })
        }
      }, 16)
    },

    downloadCip: () => {
      const state = get()
      if (!state.cipPlan) return
      downloadCipPdf(state.cipPlan, state.zones, state.result)
    },

    addPoi: (category, label) => {
      poiSequence += 1
      const { mapCenter, addedPois } = get()
      const jitter = () => (Math.random() - 0.5) * 0.01
      const poi: PointOfInterest = {
        id: `new-${poiSequence}`,
        name: `New ${label} ${poiSequence}`,
        category,
        longitude: mapCenter.longitude + jitter(),
        latitude: mapCenter.latitude + jitter(),
      }
      set({ addedPois: [...addedPois, poi] })
      recompute(true)
    },

    placeOptimalPoi: (category, label) => {
      const generation = ++impactGeneration
      set({ computing: true })
      window.setTimeout(() => {
        if (generation !== impactGeneration) return
        const state = get()
        const site = findOptimalAdditionSite({
          category,
          zones: state.zones,
          pois: [...state.pois, ...state.addedPois],
          stations: state.stations,
          transitEdges: state.transitEdges,
          serviceCategories: state.selectedServiceCategories,
          occupied: state.addedPois.map((poi) => ({
            latitude: poi.latitude,
            longitude: poi.longitude,
          })),
        })
        poiSequence += 1
        const fallback = state.mapCenter
        const poi: PointOfInterest = {
          id: `new-${poiSequence}`,
          name: `New ${label} ${poiSequence}`,
          category,
          longitude: site?.longitude ?? fallback.longitude,
          latitude: site?.latitude ?? fallback.latitude,
        }
        set({ addedPois: [...state.addedPois, poi] })
        recompute(true)
      }, 16)
    },

    movePoi: (id, longitude, latitude) => {
      set({
        addedPois: get().addedPois.map((poi) => (poi.id === id ? { ...poi, longitude, latitude } : poi)),
      })
      recompute(true)
    },

    removePoi: (id) => {
      const addedPois = get().addedPois.filter((poi) => poi.id !== id)
      set(addedPois.length === 0 ? { addedPois, additionResult: null } : { addedPois })
      recompute(true)
    },

    selectStation: (id) => set({ selectedStationId: id }),

    hoverStation: (id) => {
      if (get().hoveredStationId !== id) set({ hoveredStationId: id })
    },

    setStationState: (id, status) => {
      const stationStates = { ...get().stationStates }
      if (status === 'normal') delete stationStates[id]
      else stationStates[id] = status
      set({ stationStates, selectedStationId: id })
      syncIntelEvent()
      recompute()
    },

    resetStationStates: () => {
      set({
        stationStates: {},
        closedPoiIds: {},
        destroyedPoiIds: {},
        evacuation: null,
        intelEvent: null,
        intelNarrative: null,
      })
      clearDisruptionOnly()
    },

    togglePoiClosed: (id) => {
      const { closedPoiIds: current, destroyedPoiIds } = get()
      if (destroyedPoiIds[id]) {
        const next = { ...destroyedPoiIds }
        delete next[id]
        set({ destroyedPoiIds: next })
      } else {
        const closedPoiIds = { ...current }
        if (closedPoiIds[id]) delete closedPoiIds[id]
        else closedPoiIds[id] = true
        set({ closedPoiIds })
      }
      syncIntelEvent()
      recompute()
    },

    toggleServiceCategory: (category) => {
      const current = get().selectedServiceCategories
      const next = current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category]
      if (next.length === 0) return
      set({ selectedServiceCategories: next })
      recompute(true)
    },

    setFailureStartMinute: (minute) => {
      const failureStartMinute = Math.max(0, Math.min(1439, Math.round(minute)))
      if (failureStartMinute === get().failureStartMinute) return
      const previousCurrentStep = Math.floor(get().timeMinute / 15)
      const timeMinute = (failureStartMinute + get().failureElapsedMinutes) % 1440
      set({ failureStartMinute, timeMinute })
      if (Math.floor(timeMinute / 15) !== previousCurrentStep) recompute(true)
    },

    setFailureElapsedMinutes: (minute) => {
      const failureElapsedMinutes = Math.max(0, Math.min(1440, Math.round(minute)))
      if (failureElapsedMinutes === get().failureElapsedMinutes) return
      const previousElapsedStep = Math.floor(get().failureElapsedMinutes / 15)
      const timeMinute = (get().failureStartMinute + failureElapsedMinutes) % 1440
      set({ failureElapsedMinutes, timeMinute })
      if (Math.floor(failureElapsedMinutes / 15) !== previousElapsedStep) recompute(true)
    },

    selectZone: (zoneId) => {
      if (!zoneId) {
        set({ selectedZoneId: null })
        return
      }
      const { zones, result } = get()
      const zone = zones.find((item) => item.id === zoneId)
      const trace = result?.traces[zoneId]
      const points = trace
        ? [...trace.normalPath.nodes, ...trace.disruptedPath.nodes]
        : zone
          ? [zone.centroid]
          : []
      if (points.length === 0) {
        set({ selectedZoneId: zoneId })
        return
      }
      const pad = 0.004
      const lngs = points.map((point) => point.longitude)
      const lats = points.map((point) => point.latitude)
      set({
        selectedZoneId: zoneId,
        focusRequest: {
          bounds: [
            [Math.min(...lngs) - pad, Math.min(...lats) - pad],
            [Math.max(...lngs) + pad, Math.max(...lats) + pad],
          ],
          key: Date.now(),
        },
      })
    },

    hoverZone: (zoneId) => {
      if (get().hoveredZoneId !== zoneId) set({ hoveredZoneId: zoneId })
    },

    setDelayRange: (delayRange) => set({ delayRange }),

    setRouteView: (routeView) => set({ routeView }),

    setExtruded: (extruded) => set({ extruded }),

    applyIntelEvent: (event, narrative) => {
      const stationStates: Record<string, StationOperatingState> = {}
      for (const impact of event.stationImpacts) {
        stationStates[impact.stationId] = impact.effect
      }
      const lat = event.centerLatitude
      const lng = event.centerLongitude
      const dLat = event.radiusKm / 111
      const dLng = event.radiusKm / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)))
      const severity = Math.max(1, Math.min(5, Math.round(event.severity ?? 3)))
      const center = { latitude: lat, longitude: lng }
      const previous = get().intelEvent
      const followUp =
        previous != null &&
        haversineKm(center, { latitude: previous.centerLatitude, longitude: previous.centerLongitude }) < 0.5
      let destroyedPoiIds: Record<string, true> = {}
      if (followUp && event.structuralDamage) {
        destroyedPoiIds = { ...get().destroyedPoiIds }
      } else if (event.structuralDamage) {
        for (const poi of allDestinations(get()).pois) {
          const ratio = haversineKm(center, { latitude: poi.latitude, longitude: poi.longitude }) / event.radiusKm
          if (ratio >= 1) continue
          const chance = (0.15 + 0.15 * severity) * (1 - 0.6 * ratio)
          if (stableUnit(`${event.title}:${poi.id}`) < chance) destroyedPoiIds[poi.id] = true
        }
      }
      set({
        stationStates,
        destroyedPoiIds,
        evacuation: event.evacuation
          ? { latitude: lat, longitude: lng, radiusKm: event.radiusKm, severity }
          : null,
        selectedStationId: event.stationImpacts[0]?.stationId ?? get().selectedStationId,
        intelEvent: event,
        intelNarrative: narrative,
        selectedZoneId: null,
        focusRequest: {
          bounds: [
            [lng - dLng, lat - dLat],
            [lng + dLng, lat + dLat],
          ],
          key: Date.now(),
        },
      })
      runDisruption()
    },

    clearIntelEvent: () => {
      set({
        intelEvent: null,
        intelNarrative: null,
        stationStates: {},
        destroyedPoiIds: {},
        evacuation: null,
      })
      runDisruption()
    },
  }
})
