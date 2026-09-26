import { create } from 'zustand'
import { ApiError } from '@/services/api'
import { createPoi, createStation, removePoi, removeStation } from '@/services/buildService'
import { useScenarioStore } from '@/store/scenarioStore'
import type { PointOfInterest, PoiCategory } from '@/types/geography'
import type { MartaLine, Station } from '@/types/network'
import { categoryRgb } from '@/utils/categories'
import { MARTA_LINE_RGB, type RGB } from '@/utils/constants'

/**
 * State for the Build tab: permanent edits to the shared database.
 * Lives outside the scenario store because nothing here affects the simulation
 * until the network is reloaded after a save.
 */

export type BuildKind = 'station' | 'poi'

export type BuildTarget =
  | { type: 'station'; station: Station }
  | { type: 'poi'; poi: PointOfInterest }

export interface BuildPoint {
  longitude: number
  latitude: number
}

export interface BuildSaved {
  title: string
  color: RGB
  details: string[]
}

export const REMOVE_RGB: RGB = [255, 77, 94]

interface BuildState {
  kind: BuildKind
  pending: BuildPoint | null

  stationName: string
  line: MartaLine
  extraLines: MartaLine[]
  neighborIds: string[]
  minutesOverride: Record<string, string>
  frequency: string

  poiName: string
  category: PoiCategory

  target: BuildTarget | null
  confirming: boolean

  saving: boolean
  error: string | null
  saved: BuildSaved | null

  setKind: (kind: BuildKind) => void
  setPending: (point: BuildPoint | null) => void
  setCoordinate: (axis: 'latitude' | 'longitude', value: number) => void
  setStationName: (value: string) => void
  setLine: (line: MartaLine) => void
  toggleExtraLine: (line: MartaLine) => void
  toggleNeighbor: (stationId: string) => void
  setNeighborAt: (index: number, stationId: string) => void
  setMinutesOverride: (stationId: string, value: string) => void
  setFrequency: (value: string) => void
  setPoiName: (value: string) => void
  setCategory: (category: PoiCategory) => void
  selectTarget: (target: BuildTarget | null) => void
  setConfirming: (confirming: boolean) => void
  dismissSaved: () => void
  submit: () => Promise<void>
  remove: () => Promise<void>
}

function parseOptional(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong'
}

function titleCase(line: MartaLine): string {
  return line.charAt(0).toUpperCase() + line.slice(1)
}

export const useBuildStore = create<BuildState>()((set, get) => {
  const run = async (action: () => Promise<void>) => {
    set({ saving: true, error: null, saved: null })
    try {
      await action()
      await useScenarioStore.getState().loadNetwork()
    } catch (cause) {
      set({ error: describeError(cause) })
    } finally {
      set({ saving: false })
    }
  }

  return {
    kind: 'station',
    pending: null,
    stationName: '',
    line: 'red',
    extraLines: [],
    neighborIds: [],
    minutesOverride: {},
    frequency: '',
    poiName: '',
    category: 'grocery',
    target: null,
    confirming: false,
    saving: false,
    error: null,
    saved: null,

    // Adding and removing are exclusive: placing a point or changing what you build drops any selection.
    setKind: (kind) => set({ kind, saved: null, error: null, target: null, confirming: false }),
    setPending: (pending) => set({ pending, saved: null, target: null, confirming: false }),
    setCoordinate: (axis, value) => {
      if (!Number.isFinite(value)) return
      const current = get().pending
      set({
        pending: {
          latitude: current?.latitude ?? 33.749,
          longitude: current?.longitude ?? -84.388,
          [axis]: value,
        },
      })
    },
    setStationName: (stationName) => set({ stationName }),
    setLine: (line) => set({ line, extraLines: get().extraLines.filter((item) => item !== line) }),
    toggleExtraLine: (line) =>
      set((state) => ({
        extraLines: state.extraLines.includes(line)
          ? state.extraLines.filter((item) => item !== line)
          : [...state.extraLines, line],
      })),
    toggleNeighbor: (stationId) =>
      set((state) => {
        const current = state.neighborIds
        if (current.includes(stationId)) return { neighborIds: current.filter((id) => id !== stationId), saved: null }
        if (current.length < 2) return { neighborIds: [...current, stationId], saved: null }
        return { neighborIds: [current[0], stationId], saved: null }
      }),
    setNeighborAt: (index, stationId) =>
      set((state) => {
        const next = state.neighborIds.filter((_, position) => position !== index)
        if (stationId && !next.includes(stationId)) next.splice(index, 0, stationId)
        return { neighborIds: next, saved: null }
      }),
    setMinutesOverride: (stationId, value) =>
      set((state) => ({ minutesOverride: { ...state.minutesOverride, [stationId]: value } })),
    setFrequency: (frequency) => set({ frequency }),
    setPoiName: (poiName) => set({ poiName }),
    setCategory: (category) => set({ category }),
    selectTarget: (target) => set({ target, confirming: false, saved: null, error: null }),
    setConfirming: (confirming) => set({ confirming }),
    dismissSaved: () => set({ saved: null }),

    submit: () =>
      run(async () => {
        const state = get()
        if (!state.pending) return
        const stationById = new Map(useScenarioStore.getState().stations.map((item) => [item.id, item]))
        if (state.kind === 'station') {
          const result = await createStation({
            name: state.stationName.trim(),
            longitude: state.pending.longitude,
            latitude: state.pending.latitude,
            line: state.line,
            extraLines: state.extraLines.filter((item) => item !== state.line),
            neighbors: state.neighborIds.map((id) => ({
              stationId: id,
              travelMinutes: parseOptional(state.minutesOverride[id] ?? ''),
            })),
            frequencyMinutes: parseOptional(state.frequency),
          })
          const details = [
            `${result.transitEdges.length} rail links added on the ${titleCase(state.line)} line`,
            `${result.accessEdges} homes and destinations can now walk to it`,
          ]
          if (result.removedEdges > 0) {
            const names = state.neighborIds.map((id) => stationById.get(id)?.name ?? id)
            details.splice(1, 0, `Inserted between ${names.join(' and ')}`)
          }
          set({
            saved: { title: `${result.station.name} is now on the map`, color: MARTA_LINE_RGB[state.line], details },
            stationName: '',
            neighborIds: [],
            minutesOverride: {},
            pending: null,
          })
          return
        }
        const result = await createPoi({
          name: state.poiName.trim(),
          category: state.category,
          longitude: state.pending.longitude,
          latitude: state.pending.latitude,
        })
        const nearest = result.accessEdges.slice(0, 3).map((edge) => {
          const station = stationById.get(edge.stationId)
          return `${station?.name ?? edge.stationId} · ${Math.round(edge.walkingMinutes)} min walk`
        })
        set({
          saved: {
            title: `${result.poi.name} is now on the map`,
            color: categoryRgb(state.category),
            details: nearest.length > 0 ? ['Reachable from', ...nearest] : ['No station within walking range'],
          },
          poiName: '',
          pending: null,
        })
      }),

    remove: () =>
      run(async () => {
        const target = get().target
        if (!target) return
        if (target.type === 'station') {
          const result = await removeStation(target.station.id)
          const details = [`${result.removedEdges} rail links removed`]
          if (result.bridgedEdges.length > 0) {
            const lines = [...new Set(result.bridgedEdges.map((edge) => titleCase(edge.line)))]
            details.push(`${lines.join(' and ')} line re-joined across the gap`)
          }
          details.push('Walking links recomputed for everyone nearby')
          set({
            saved: { title: `${result.station.name} removed`, color: REMOVE_RGB, details },
            neighborIds: get().neighborIds.filter((id) => id !== target.station.id),
          })
        } else {
          const result = await removePoi(target.poi.id)
          set({
            saved: {
              title: `${result.poi.name} removed`,
              color: REMOVE_RGB,
              details: [`${result.removedAccessEdges} walking links removed`],
            },
          })
        }
        set({ target: null, confirming: false })
      }),
  }
})
