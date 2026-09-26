import { create } from 'zustand'
import { buildAccessSimulation } from '@/services/accessSimulator'
import { attachAccess, getAccessEdges, getPointsOfInterest, getZones } from '@/services/geoService'
import { getNetwork } from '@/services/stationService'
import type { PointOfInterest, PoiCategory, ResidentialZone } from '@/types/geography'
import type { Station, StationOperatingState, TransitEdge } from '@/types/network'
import type { RouteView, SimulationResult, TraceImpact } from '@/types/simulation'
import { DEFAULT_CATEGORY_WEIGHTS, categoryWeight } from '@/utils/categoryWeights'

type LoadStatus = 'loading' | 'ready' | 'error'

interface FocusRequest {
  bounds: [[number, number], [number, number]]
  key: number
}

interface ScenarioState {
  loadStatus: LoadStatus
  loadError: string | null
  stations: Station[]
  transitEdges: TransitEdge[]
  zones: ResidentialZone[]
  pois: PointOfInterest[]

  stationStates: Record<string, StationOperatingState>
  selectedStationId: string | null
  hoveredStationId: string | null
  selectedServiceCategories: PoiCategory[]
  categoryWeights: Record<PoiCategory, number>

  result: SimulationResult | null
  computing: boolean
  simulationError: string | null

  selectedZoneId: string | null
  hoveredZoneId: string | null
  delayRange: [number, number] | null
  routeView: RouteView
  extruded: boolean
  focusRequest: FocusRequest | null

  loadNetwork: () => Promise<void>
  selectStation: (id: string | null) => void
  hoverStation: (id: string | null) => void
  setStationState: (id: string, status: StationOperatingState) => void
  resetStationStates: () => void
  toggleServiceCategory: (category: PoiCategory) => void
  setCategoryWeight: (category: PoiCategory, weight: number) => void
  selectZone: (zoneId: string | null) => void
  hoverZone: (zoneId: string | null) => void
  setDelayRange: (range: [number, number] | null) => void
  setRouteView: (view: RouteView) => void
  setExtruded: (extruded: boolean) => void
}

const DEFAULT_CATEGORIES: PoiCategory[] = ['government', 'hospital', 'grocery']

export function selectTrace(state: ScenarioState): TraceImpact | null {
  if (!state.selectedZoneId || !state.result) return null
  return state.result.traces[state.selectedZoneId] ?? null
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

export const useScenarioStore = create<ScenarioState>((set, get) => {
  const clearImpacts = () => {
    impactGeneration += 1
    set({
      computing: false,
      result: null,
      simulationError: null,
      selectedZoneId: null,
      delayRange: null,
    })
  }

  const recompute = () => {
    const { maintenanceStations, shutdownStations } = disruptionLists(get().stationStates)
    if (maintenanceStations.length + shutdownStations.length === 0) {
      clearImpacts()
      return
    }
    const generation = ++impactGeneration
    set({ computing: true })
    // Yield a frame so the UI can paint the pending state before the synchronous solve.
    window.setTimeout(() => {
      if (generation !== impactGeneration) return
      const state = get()
      try {
        const result = buildAccessSimulation({
          maintenanceStations,
          shutdownStations,
          serviceCategories: state.selectedServiceCategories,
          categoryWeights: state.categoryWeights,
          zones: state.zones,
          pois: state.pois,
          stations: state.stations,
          transitEdges: state.transitEdges,
        })
        const keepZone = state.selectedZoneId && result.traces[state.selectedZoneId]
        set({
          computing: false,
          result,
          simulationError: null,
          selectedZoneId: keepZone ? state.selectedZoneId : null,
        })
      } catch (error) {
        set({
          computing: false,
          result: null,
          selectedZoneId: null,
          simulationError: error instanceof Error ? error.message : 'Simulation failed',
        })
      }
    }, 16)
  }

  return {
    loadStatus: 'loading',
    loadError: null,
    stations: [],
    transitEdges: [],
    zones: [],
    pois: [],

    stationStates: {},
    selectedStationId: null,
    hoveredStationId: null,
    selectedServiceCategories: DEFAULT_CATEGORIES,
    categoryWeights: { ...DEFAULT_CATEGORY_WEIGHTS },

    result: null,
    computing: false,
    simulationError: null,

    selectedZoneId: null,
    hoveredZoneId: null,
    delayRange: null,
    routeView: 'both',
    extruded: false,
    focusRequest: null,

    loadNetwork: async () => {
      set({ loadStatus: 'loading', loadError: null })
      try {
        const [network, zones, pois, accessEdges] = await Promise.all([
          getNetwork(),
          getZones(),
          getPointsOfInterest(),
          getAccessEdges(),
        ])
        const connected = attachAccess(zones, pois, accessEdges)
        set({
          stations: network.stations,
          transitEdges: network.transitEdges,
          zones: connected.zones,
          pois: connected.pois,
          selectedStationId:
            get().selectedStationId ??
            network.stations.find((station) => /five points/i.test(station.name))?.id ??
            null,
          loadStatus: 'ready',
        })
        recompute()
      } catch (error) {
        set({
          loadStatus: 'error',
          loadError: error instanceof Error ? error.message : 'Failed to load network',
        })
      }
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
      recompute()
    },

    resetStationStates: () => {
      set({ stationStates: {} })
      clearImpacts()
    },

    toggleServiceCategory: (category) => {
      const current = get().selectedServiceCategories
      const next = current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category]
      if (next.length === 0) return
      set({ selectedServiceCategories: next })
      recompute()
    },

    setCategoryWeight: (category, weight) => {
      const next = categoryWeight({ [category]: weight }, category)
      if (get().categoryWeights[category] === next) return
      set({ categoryWeights: { ...get().categoryWeights, [category]: next } })
      recompute()
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
  }
})
