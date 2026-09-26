import { create } from 'zustand'
import { getPointsOfInterest, getZones } from '@/services/geoService'
import { getStations, getTransitEdges } from '@/services/stationService'
import { getTraceImpact, simulateScenario } from '@/services/simulationService'
import type { PointOfInterest, PoiCategory, ResidentialZone } from '@/types/geography'
import type { Station, TransitEdge } from '@/types/network'
import type {
  AppMode,
  SimulationResult,
  SimulationStatus,
  TraceImpact,
} from '@/types/simulation'

interface ScenarioState {
  activeAppMode: AppMode
  selectedStationId: string
  selectedServiceCategories: PoiCategory[]
  simulationStatus: SimulationStatus
  simulationError: string | null
  simulationResult: SimulationResult | null
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
  toggleServiceCategory: (category: PoiCategory) => void
  loadNetwork: () => Promise<void>
  runSimulation: () => Promise<void>
  resetSimulation: () => void
  selectZone: (zoneId: string | null) => Promise<void>
  setBeforeAfterMode: (mode: 'both' | 'normal' | 'disrupted') => void
}

const defaultCategories: PoiCategory[] = ['hospital', 'grocery', 'pharmacy']

export const useScenarioStore = create<ScenarioState>((set, get) => ({
  activeAppMode: 'simulate',
  selectedStationId: 'FIVE_POINTS',
  selectedServiceCategories: defaultCategories,
  simulationStatus: 'idle',
  simulationError: null,
  simulationResult: null,
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

  setSelectedStation: (id) =>
    set({
      selectedStationId: id,
      simulationStatus: 'idle',
      simulationResult: null,
      selectedZoneId: null,
      traceImpact: null,
      beforeAfterMode: 'both',
    }),

  toggleServiceCategory: (category) => {
    const current = get().selectedServiceCategories
    const next = current.includes(category)
      ? current.filter((item) => item !== category)
      : [...current, category]
    set({ selectedServiceCategories: next.length ? next : current })
  },

  loadNetwork: async () => {
    const [stations, transitEdges, zones, pois] = await Promise.all([
      getStations(),
      getTransitEdges(),
      getZones(),
      getPointsOfInterest(),
    ])
    set({ stations, transitEdges, zones, pois, networkReady: true })
  },

  runSimulation: async () => {
    const { selectedStationId, selectedServiceCategories } = get()
    set({
      simulationStatus: 'loading',
      simulationError: null,
      selectedZoneId: null,
      traceImpact: null,
      beforeAfterMode: 'both',
    })
    try {
      const simulationResult = await simulateScenario({
        closedStations: [selectedStationId],
        serviceCategories: selectedServiceCategories,
      })
      set({ simulationStatus: 'success', simulationResult })
    } catch (error) {
      set({
        simulationStatus: 'error',
        simulationError: error instanceof Error ? error.message : 'Simulation failed',
      })
    }
  },

  resetSimulation: () =>
    set({
      simulationStatus: 'idle',
      simulationResult: null,
      selectedZoneId: null,
      selectedPoiId: null,
      traceImpact: null,
      simulationError: null,
      beforeAfterMode: 'both',
    }),

  selectZone: async (zoneId) => {
    const { simulationResult, zones } = get()
    if (!zoneId) {
      set({ selectedZoneId: null, selectedPoiId: null, traceImpact: null, traceStatus: 'idle' })
      return
    }
    const zone = zones.find((item) => item.id === zoneId)
    set({
      selectedZoneId: zoneId,
      traceStatus: 'loading',
      focusRequest: zone
        ? {
            longitude: zone.centroid.longitude,
            latitude: zone.centroid.latitude,
            zoom: 12.6,
            key: Date.now(),
          }
        : null,
    })
    if (!simulationResult) return
    try {
      const impact = simulationResult.zoneImpacts.find((item) => item.zoneId === zoneId)
      const traceImpact = await getTraceImpact({
        scenarioId: simulationResult.scenario.id,
        zoneId,
        poiId: impact?.poiId,
      }).catch(() => simulationResult.traces[zoneId])
      if (!traceImpact) throw new Error('Trace not found')
      set({
        traceImpact,
        selectedPoiId: traceImpact.poiId,
        traceStatus: 'success',
      })
    } catch (error) {
      set({
        traceStatus: 'error',
        simulationError: error instanceof Error ? error.message : 'Trace failed',
      })
    }
  },

  setBeforeAfterMode: (mode) => set({ beforeAfterMode: mode }),
}))
