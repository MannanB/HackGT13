import { create } from 'zustand'
import {
  buildAccessSimulation,
  buildAdditionSimulation,
  createPoiCriticalIndex,
  findOptimalAdditionSite,
} from '@/services/accessSimulator'
import { attachAccess, getAccessEdges, getPointsOfInterest, getZones } from '@/services/geoService'
import { getNetwork } from '@/services/stationService'
import type { PointOfInterest, PoiCategory, ResidentialZone } from '@/types/geography'
import type { Station, StationOperatingState, TransitEdge } from '@/types/network'
import type { PoiCriticalStation, RouteView, SimulationResult, TraceImpact } from '@/types/simulation'
import type { IntelEvent } from '@/types/intelligence'

type LoadStatus = 'loading' | 'ready' | 'error'
export type AppMode = 'disrupt' | 'add' | 'intel'

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

  stationStates: Record<string, StationOperatingState>
  selectedStationId: string | null
  hoveredStationId: string | null
  selectedServiceCategories: PoiCategory[]

  result: SimulationResult | null
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

  setAppMode: (mode: AppMode) => void
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
  toggleServiceCategory: (category: PoiCategory) => void
  selectZone: (zoneId: string | null) => void
  hoverZone: (zoneId: string | null) => void
  setDelayRange: (range: [number, number] | null) => void
  setRouteView: (view: RouteView) => void
  setExtruded: (extruded: boolean) => void
  applyIntelEvent: (event: IntelEvent, narrative: string) => void
  clearIntelEvent: () => void
}

const DEFAULT_CATEGORIES: PoiCategory[] = ['government', 'hospital', 'grocery']

function allDestinations(state: Pick<ScenarioState, 'pois' | 'addedPois' | 'selectedServiceCategories'>) {
  const pois = [...state.pois, ...state.addedPois]
  const serviceCategories = [
    ...new Set([...state.selectedServiceCategories, ...state.addedPois.map((poi) => poi.category)]),
  ]
  return { pois, serviceCategories }
}

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
let criticalGeneration = 0

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

  const runDisruption = () => {
    const { maintenanceStations, shutdownStations } = disruptionLists(get().stationStates)
    if (maintenanceStations.length + shutdownStations.length === 0) {
      clearImpacts()
      return
    }
    const generation = ++impactGeneration
    set({ computing: true })
    window.setTimeout(() => {
      if (generation !== impactGeneration) return
      const state = get()
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

  const recompute = () => {
    if (get().appMode === 'add') {
      recomputeAddition()
      return
    }
    runDisruption()
  }

  const recomputeAddition = () => {
    if (get().addedPois.length === 0) {
      clearImpacts()
      return
    }
    const generation = ++impactGeneration
    set({ computing: true })
    window.requestAnimationFrame(() => {
      if (generation !== impactGeneration) return
      const state = get()
      try {
        const result = buildAdditionSimulation({
          addedPois: state.addedPois,
          serviceCategories: state.selectedServiceCategories,
          zones: state.zones,
          pois: state.pois,
          stations: state.stations,
          transitEdges: state.transitEdges,
        })
        const keepZone = state.selectedZoneId && result.traces[state.selectedZoneId]
        set({ computing: false, result, simulationError: null, selectedZoneId: keepZone ? state.selectedZoneId : null })
      } catch (error) {
        set({
          computing: false,
          result: null,
          selectedZoneId: null,
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

    stationStates: {},
    selectedStationId: null,
    hoveredStationId: null,
    selectedServiceCategories: DEFAULT_CATEGORIES,

    result: null,
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

    loadNetwork: async () => {
      criticalGeneration += 1
      set({ loadStatus: 'loading', loadError: null, poiCriticalById: {}, poiCriticalProgress: 0 })
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
          poiCriticalById: {},
        })
        const generation = ++criticalGeneration
        window.setTimeout(() => {
          if (generation !== criticalGeneration) return
          const index = createPoiCriticalIndex({
            zones: connected.zones,
            pois: connected.pois,
            stations: network.stations,
            transitEdges: network.transitEdges,
          })
          let cursor = 0
          const step = () => {
            if (generation !== criticalGeneration) return
            const batchEnd = Math.min(cursor + 2, index.stations.length)
            while (cursor < batchEnd) {
              index.absorb(index.stations[cursor])
              cursor += 1
            }
            set({
              poiCriticalById: index.snapshot(),
              poiCriticalProgress: index.stations.length ? cursor / index.stations.length : 1,
            })
            if (cursor < index.stations.length) window.setTimeout(step, 0)
          }
          step()
        }, 16)
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
      set({ appMode, result: null, selectedZoneId: null })
      recompute()
    },

    setMapCenter: (longitude, latitude) => set({ mapCenter: { longitude, latitude } }),

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
      recompute()
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
        recompute()
      }, 16)
    },

    movePoi: (id, longitude, latitude) => {
      set({
        addedPois: get().addedPois.map((poi) => (poi.id === id ? { ...poi, longitude, latitude } : poi)),
      })
      recompute()
    },

    removePoi: (id) => {
      set({ addedPois: get().addedPois.filter((poi) => poi.id !== id) })
      recompute()
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
      set({
        stationStates,
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
      set({ intelEvent: null, intelNarrative: null, stationStates: {} })
      clearImpacts()
    },
  }
})
