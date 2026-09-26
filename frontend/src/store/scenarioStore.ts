import { create } from 'zustand'
import { buildAccessSimulation } from '@/services/accessSimulator'
import { attachAccess, getAccessEdges, getPointsOfInterest, getZones } from '@/services/geoService'
import { getNetwork } from '@/services/stationService'
import type { PointOfInterest, PoiCategory, ResidentialZone } from '@/types/geography'
import { DEFAULT_CATEGORY_WEIGHTS, categoryWeight } from '@/utils/categoryWeights'
import type { Station, StationOperatingState, TransitEdge } from '@/types/network'
import type {
  AppMode,
  SimulationResult,
  SimulationStatus,
  TraceImpact,
} from '@/types/simulation'

interface ScenarioState {
  activeAppMode: AppMode
  selectedStationId: string
  stationStates: Record<string, StationOperatingState>
  selectedServiceCategories: PoiCategory[]
  categoryWeights: Record<PoiCategory, number>
  simulationStatus: SimulationStatus
  simulationError: string | null
  simulationResult: SimulationResult | null
  impactPending: boolean
  selectedZoneId: string | null
  selectedPoiId: string | null
  traceImpact: TraceImpact | null
  traceStatus: SimulationStatus
  beforeAfterMode: 'both' | 'normal' | 'disrupted'
  stations: Station[]
  transitEdges: TransitEdge[]
  zones: ResidentialZone[]
  pois: PointOfInterest[]
  networkReady: boolean
  focusRequest: { longitude: number; latitude: number; zoom: number; key: number } | null
  setAppMode: (mode: AppMode) => void
  setSelectedStation: (id: string) => void
  setStationState: (id: string, status: StationOperatingState) => void
  resetStationStates: () => void
  toggleServiceCategory: (category: PoiCategory) => void
  setCategoryWeight: (category: PoiCategory, weight: number) => void
  loadNetwork: () => Promise<void>
  selectZone: (zoneId: string | null) => void
  setBeforeAfterMode: (mode: 'both' | 'normal' | 'disrupted') => void
}

const defaultCategories: PoiCategory[] = ['government', 'hospital', 'grocery']

let impactGeneration = 0

function disruptionLists(stationStates: Record<string, StationOperatingState>) {
  const maintenanceStations: string[] = []
  const shutdownStations: string[] = []
  for (const [id, status] of Object.entries(stationStates)) {
    if (status === 'maintenance') maintenanceStations.push(id)
    if (status === 'shutdown') shutdownStations.push(id)
  }
  return { maintenanceStations, shutdownStations }
}

function clearedImpacts() {
  return {
    impactPending: false,
    simulationStatus: 'idle' as const,
    simulationResult: null,
    simulationError: null,
    selectedZoneId: null,
    selectedPoiId: null,
    traceImpact: null,
    traceStatus: 'idle' as const,
    beforeAfterMode: 'both' as const,
  }
}

function impactsFrom(
  snapshot: Pick<
    ScenarioState,
    | 'selectedServiceCategories'
    | 'categoryWeights'
    | 'zones'
    | 'pois'
    | 'stations'
    | 'transitEdges'
    | 'selectedZoneId'
  >,
  stationStates: Record<string, StationOperatingState>,
) {
  const { maintenanceStations, shutdownStations } = disruptionLists(stationStates)
  if (maintenanceStations.length + shutdownStations.length === 0) return clearedImpacts()
  try {
    const simulationResult = buildAccessSimulation({
      maintenanceStations,
      shutdownStations,
      serviceCategories: snapshot.selectedServiceCategories,
      categoryWeights: snapshot.categoryWeights,
      zones: snapshot.zones,
      pois: snapshot.pois,
      stations: snapshot.stations,
      transitEdges: snapshot.transitEdges,
    })
    const zoneId = snapshot.selectedZoneId
    const traceImpact = zoneId ? (simulationResult.traces[zoneId] ?? null) : null
    return {
      impactPending: false,
      simulationStatus: 'success' as const,
      simulationResult,
      simulationError: null,
      selectedZoneId: traceImpact ? zoneId : null,
      selectedPoiId: traceImpact?.poiId ?? null,
      traceImpact,
      traceStatus: traceImpact ? ('success' as const) : ('idle' as const),
    }
  } catch (error) {
    return {
      impactPending: false,
      simulationStatus: 'error' as const,
      simulationError: error instanceof Error ? error.message : 'Simulation failed',
      simulationResult: null,
      traceImpact: null,
      traceStatus: 'idle' as const,
      selectedZoneId: null,
      selectedPoiId: null,
    }
  }
}

export const useScenarioStore = create<ScenarioState>((set, get) => {
  const publishImpacts = (stationStates: Record<string, StationOperatingState>) => {
    const { maintenanceStations, shutdownStations } = disruptionLists(stationStates)
    if (maintenanceStations.length + shutdownStations.length === 0) {
      impactGeneration += 1
      set(clearedImpacts())
      return
    }
    const generation = ++impactGeneration
    set({ impactPending: true })
    window.setTimeout(() => {
      if (generation !== impactGeneration) return
      const current = get()
      set(impactsFrom(current, current.stationStates))
    }, 0)
  }

  return {
    activeAppMode: 'simulate',
    selectedStationId: '',
    stationStates: {},
    selectedServiceCategories: defaultCategories,
    categoryWeights: { ...DEFAULT_CATEGORY_WEIGHTS },
    simulationStatus: 'idle',
    simulationError: null,
    simulationResult: null,
    impactPending: false,
    selectedZoneId: null,
    selectedPoiId: null,
    traceImpact: null,
    traceStatus: 'idle',
    beforeAfterMode: 'both',
    stations: [],
    transitEdges: [],
    zones: [],
    pois: [],
    networkReady: false,
    focusRequest: null,

    setAppMode: (mode) => set({ activeAppMode: mode }),

    setSelectedStation: (id) => set({ selectedStationId: id }),

    setStationState: (id, status) => {
      const stationStates = { ...get().stationStates }
      if (status === 'normal') delete stationStates[id]
      else stationStates[id] = status
      set({ stationStates, selectedStationId: id })
      publishImpacts(stationStates)
    },

    resetStationStates: () => {
      impactGeneration += 1
      set({ stationStates: {}, ...clearedImpacts() })
    },

    toggleServiceCategory: (category) => {
      const current = get().selectedServiceCategories
      const next = current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category]
      if (next.length === 0) return
      set({ selectedServiceCategories: next })
      publishImpacts(get().stationStates)
    },

    setCategoryWeight: (category, weight) => {
      const next = categoryWeight({ [category]: weight }, category)
      set({ categoryWeights: { ...get().categoryWeights, [category]: next } })
      publishImpacts(get().stationStates)
    },

    loadNetwork: async () => {
      try {
        const [network, zones, pois, accessEdges] = await Promise.all([
          getNetwork(),
          getZones(),
          getPointsOfInterest(),
          getAccessEdges(),
        ])
        const connected = attachAccess(zones, pois, accessEdges)
        const fivePoints = network.stations.find((station) => /five points/i.test(station.name))
        const currentId = get().selectedStationId
        const stillValid = network.stations.some((station) => station.id === currentId)
        const known = new Set(network.stations.map((station) => station.id))
        const stationStates = Object.fromEntries(
          Object.entries(get().stationStates).filter(([id]) => known.has(id)),
        )
        set({
          stations: network.stations,
          transitEdges: network.transitEdges,
          zones: connected.zones,
          pois: connected.pois,
          stationStates,
          selectedStationId: stillValid
            ? currentId
            : (fivePoints?.id ?? network.stations[0]?.id ?? ''),
          networkReady: true,
          simulationError: null,
        })
        publishImpacts(stationStates)
      } catch (error) {
        set({
          networkReady: true,
          simulationError: error instanceof Error ? error.message : 'Failed to load network',
        })
      }
    },

    selectZone: (zoneId) => {
      const { simulationResult, zones } = get()
      if (!zoneId) {
        set({ selectedZoneId: null, selectedPoiId: null, traceImpact: null, traceStatus: 'idle' })
        return
      }
      const zone = zones.find((item) => item.id === zoneId)
      const traceImpact = simulationResult?.traces[zoneId] ?? null
      set({
        selectedZoneId: zoneId,
        traceImpact,
        selectedPoiId: traceImpact?.poiId ?? null,
        traceStatus: traceImpact ? 'success' : 'idle',
        focusRequest: zone
          ? {
              longitude: zone.centroid.longitude,
              latitude: zone.centroid.latitude,
              zoom: 12.6,
              key: Date.now(),
            }
          : null,
      })
    },

    setBeforeAfterMode: (mode) => set({ beforeAfterMode: mode }),
  }
})
