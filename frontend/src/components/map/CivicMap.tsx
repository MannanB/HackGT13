import type { LayersList, PickingInfo } from '@deck.gl/core'
import { MapboxOverlay, type MapboxOverlayProps } from '@deck.gl/mapbox'
import { Loader2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Map as MapView, useControl, type MapRef } from 'react-map-gl/maplibre'
import { ADDED_POI_LAYER, createAddedPoiLayers } from '@/components/map/AddedPoiLayer'
import { BUILD_PENDING_LAYER, createBuildLayers } from '@/components/map/BuildLayer'
import { createEventRadiusLayer } from '@/components/map/EventRadiusLayer'
import { createPassengerFlowLayers } from '@/components/map/FlowMapLayer'
import { createLiveTrainLayers, simulatedTrains } from '@/components/map/LiveTrainLayer'
import { createMartaNetworkLayers } from '@/components/map/MartaNetworkLayer'
import { createPoiLayers } from '@/components/map/PoiLayer'
import { createRouteLayers } from '@/components/map/RouteLayer'
import { createStationLayers } from '@/components/map/StationLayer'
import { createZoneImpactLayer, zoneCollection, type ZoneFeature } from '@/components/map/ZoneImpactLayer'
import { StationStatePicker } from '@/components/scenario/StationStatePicker'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Segmented } from '@/components/ui/Segmented'
import { useBuildStore } from '@/store/buildStore'
import { selectTrace, useScenarioStore } from '@/store/scenarioStore'
import { buildBaselineJourneys } from '@/services/accessSimulator'
import type { PointOfInterest, PoiCategory } from '@/types/geography'
import type { Station } from '@/types/network'
import type { HospitalCapacity, PoiStationPressure } from '@/types/simulation'
import { categoryMeta, categoryRgb } from '@/utils/categories'
import {
  ATLANTA_VIEW,
  GAIN_BREAKS,
  IMPACT_BREAKS,
  MAP_STYLE,
  MARTA_LINE_HEX,
  MARTA_LINE_RGB,
  delayHex,
  formatPopulation,
  formatVisitorRate,
  gainHex,
  hex,
} from '@/utils/constants'
import { softenBasemapRoads } from '@/utils/softenBasemap'
import { hourAt } from '@/utils/hourlyDemand'
import 'maplibre-gl/dist/maplibre-gl.css'

const PANEL_PADDING = { top: 40, bottom: 40, left: 380, right: 400 }

type Hover =
  | { kind: 'station'; station: Station }
  | { kind: 'zone'; feature: ZoneFeature; gain: boolean }
  | { kind: 'poi'; poi: PointOfInterest }

interface Placed<T> {
  item: T
  left: number
  top: number
}

function DeckOverlay(props: MapboxOverlayProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props))
  overlay.setProps(props)
  return null
}

export function CivicMap() {
  const mapRef = useRef<MapRef>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<Placed<Hover> | null>(null)
  const [popover, setPopover] = useState<Placed<string> | null>(null)
  const [poiPopover, setPoiPopover] = useState<Placed<PointOfInterest> | null>(null)
  const [motionTime, setMotionTime] = useState(() => performance.now())
  const [mapZoom, setMapZoom] = useState(ATLANTA_VIEW.zoom)

  const stations = useScenarioStore((state) => state.stations)
  const transitEdges = useScenarioStore((state) => state.transitEdges)
  const zones = useScenarioStore((state) => state.zones)
  const pois = useScenarioStore((state) => state.pois)
  const streetRoutes = useScenarioStore((state) => state.streetRoutes)
  const stationStates = useScenarioStore((state) => state.stationStates)
  const selectedStationId = useScenarioStore((state) => state.selectedStationId)
  const hoveredStationId = useScenarioStore((state) => state.hoveredStationId)
  const categories = useScenarioStore((state) => state.selectedServiceCategories)
  const result = useScenarioStore((state) => state.result)
  const selectedZoneId = useScenarioStore((state) => state.selectedZoneId)
  const hoveredZoneId = useScenarioStore((state) => state.hoveredZoneId)
  const delayRange = useScenarioStore((state) => state.delayRange)
  const trace = useScenarioStore(selectTrace)
  const routeView = useScenarioStore((state) => state.routeView)
  const extruded = useScenarioStore((state) => state.extruded)
  const focusRequest = useScenarioStore((state) => state.focusRequest)
  const selectStation = useScenarioStore((state) => state.selectStation)
  const hoverStation = useScenarioStore((state) => state.hoverStation)
  const selectZone = useScenarioStore((state) => state.selectZone)
  const hoverZone = useScenarioStore((state) => state.hoverZone)
  const appMode = useScenarioStore((state) => state.appMode)
  const setAppMode = useScenarioStore((state) => state.setAppMode)
  const addedPois = useScenarioStore((state) => state.addedPois)
  const intelEvent = useScenarioStore((state) => state.intelEvent)
  const movePoi = useScenarioStore((state) => state.movePoi)
  const setMapCenter = useScenarioStore((state) => state.setMapCenter)
  const disruptionResult = useScenarioStore((state) => state.disruptionResult)
  const additionResult = useScenarioStore((state) => state.additionResult)
  const timeMinute = useScenarioStore((state) => state.timeMinute)
  const selectedHour = hourAt(timeMinute)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const gain = appMode === 'add'
  const showPlanGain = appMode === 'add' || appMode === 'intel'
  const building = appMode === 'build'
  const motionActive = stations.length > 0

  const buildPending = useBuildStore((state) => state.pending)
  const buildStationName = useBuildStore((state) => state.stationName)
  const buildLine = useBuildStore((state) => state.line)
  const buildNeighborIds = useBuildStore((state) => state.neighborIds)
  const buildTarget = useBuildStore((state) => state.target)
  const setBuildPending = useBuildStore((state) => state.setPending)
  const moveBuildPending = useBuildStore((state) => state.movePending)
  const selectBuildTarget = useBuildStore((state) => state.selectTarget)
  const draggingBuild = draggingId === BUILD_PENDING_LAYER
  const buildLayers = useMemo(() => {
    if (!building) return []
    const color = MARTA_LINE_RGB[buildLine]
    return createBuildLayers({
      pending: buildPending
        ? {
            point: buildPending,
            label: buildStationName.trim() || 'New stop',
            color,
            isStation: true,
          }
        : null,
      neighborStations: buildNeighborIds
        .map((id) => stations.find((station) => station.id === id))
        .filter((station): station is Station => Boolean(station)),
      lineColor: color,
      dragging: draggingBuild,
    })
  }, [building, buildPending, buildStationName, buildLine, buildNeighborIds, stations, draggingBuild])
  const buildSelectedStationId = building && buildTarget ? buildTarget.id : null

  const closedPoiIds = useScenarioStore((state) => state.closedPoiIds)
  const destroyedPoiIds = useScenarioStore((state) => state.destroyedPoiIds)
  const destroyedPoiIdSet = useMemo(() => new Set(Object.keys(destroyedPoiIds)), [destroyedPoiIds])
  const closedPoiIdSet = useMemo(
    () => new Set([...Object.keys(closedPoiIds), ...destroyedPoiIdSet]),
    [closedPoiIds, destroyedPoiIdSet],
  )
  const shutdownIds = useMemo(
    () => new Set(Object.keys(stationStates).filter((id) => stationStates[id] === 'shutdown')),
    [stationStates],
  )
  const zoneData = useMemo(
    () =>
      zoneCollection(
        zones,
        disruptionResult?.zoneImpacts ?? [],
        showPlanGain ? (additionResult?.zoneImpacts ?? []) : [],
      ),
    [zones, disruptionResult, additionResult, showPlanGain],
  )
  const hospitalCapacity = useMemo(() => {
    if (result?.hospitalCapacity && result.hospitalCapacity.length > 0) return result.hospitalCapacity
    return disruptionResult?.hospitalCapacity ?? []
  }, [result, disruptionResult])
  const hospitalLoadById = useMemo(() => {
    const loads = new Map<string, HospitalCapacity>()
    for (const item of hospitalCapacity) loads.set(item.poiId, item)
    return loads
  }, [hospitalCapacity])
  const maxCapacityIds = useMemo(
    () => new Set(hospitalCapacity.filter((item) => item.atMaxCapacity).map((item) => item.poiId)),
    [hospitalCapacity],
  )
  const baselineJourneys = useMemo(
    () => buildBaselineJourneys({
      serviceCategories: categories,
      zones,
      pois,
      stations,
      transitEdges,
      timeMinute: selectedHour * 60,
    }),
    [categories, zones, pois, stations, transitEdges, selectedHour],
  )
  const trains = useMemo(
    () => (motionActive ? simulatedTrains(stations, transitEdges, shutdownIds, motionTime) : []),
    [motionActive, stations, transitEdges, shutdownIds, motionTime],
  )

  useEffect(() => {
    if (!motionActive) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) return
    let frame = 0
    let last = 0
    const animate = (now: number) => {
      if (now - last >= 33) {
        last = now
        setMotionTime(now)
      }
      frame = window.requestAnimationFrame(animate)
    }
    frame = window.requestAnimationFrame(animate)
    return () => window.cancelAnimationFrame(frame)
  }, [motionActive])

  useEffect(() => {
    if (!focusRequest) return
    mapRef.current?.fitBounds(focusRequest.bounds, {
      padding: PANEL_PADDING,
      maxZoom: 13.5,
      duration: 900,
      essential: true,
    })
  }, [focusRequest])

  const layers = useMemo<LayersList>(
    () => [
      createZoneImpactLayer({
        data: zoneData,
        selectedZoneId,
        hoveredZoneId,
        delayRange,
        extruded,
      }),
      ...createEventRadiusLayer(intelEvent),
      ...createMartaNetworkLayers(transitEdges, stations, shutdownIds),
      ...createPassengerFlowLayers(
        gain ? disruptionResult : result,
        baselineJourneys,
        streetRoutes,
        motionTime,
        mapZoom,
      ),
      ...createPoiLayers({
        pois: showPlanGain ? pois : [...pois, ...addedPois],
        categories,
        pressure: result?.poiPressure ?? [],
        maxCapacityIds,
        closedIds: closedPoiIdSet,
        destroyedIds: destroyedPoiIdSet,
        tracePoiId: trace?.poiId ?? null,
        zoom: mapZoom,
        gain,
      }),
      ...createRouteLayers(
        trace && routeView !== 'disrupted' ? trace.normalPath : null,
        trace && routeView !== 'normal' ? trace.disruptedPath : null,
      ),
      ...createStationLayers({
        stations,
        stationStates,
        selectedId: building ? buildSelectedStationId : selectedStationId,
        hoveredId: hoveredStationId,
      }),
      ...createLiveTrainLayers(trains),
      ...(showPlanGain && addedPois.length > 0 ? createAddedPoiLayers(addedPois, draggingId) : []),
      ...buildLayers,
    ],
    [
      zoneData, selectedZoneId, hoveredZoneId, delayRange, extruded, transitEdges, stations,
      shutdownIds, pois, categories, result, trace, routeView, stationStates, selectedStationId,
      hoveredStationId, gain, showPlanGain, addedPois, draggingId, intelEvent, motionTime, trains,
      baselineJourneys, streetRoutes, mapZoom, disruptionResult, maxCapacityIds, closedPoiIdSet, destroyedPoiIdSet,
      buildLayers, building, buildSelectedStationId,
    ],
  )

  const place = <T,>(item: T, info: PickingInfo, w: number, h: number): Placed<T> => {
    const width = frameRef.current?.clientWidth ?? 1200
    const height = frameRef.current?.clientHeight ?? 800
    return {
      item,
      left: Math.min(Math.max(8, info.x + 16), width - w - 8),
      top: Math.min(Math.max(8, info.y + 16), height - h - 8),
    }
  }

  const activePopover = popover?.item === selectedStationId ? popover : null

  const markerUnderPointer = useRef<string | null>(null)

  const startMarkerDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const id = markerUnderPointer.current
    if (!id || event.button !== 0) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDraggingId(id)
    setHover(null)
  }

  const moveMarker = (event: React.PointerEvent<HTMLDivElement>) => {
    const map = mapRef.current
    if (!draggingId || !map) return
    const rect = event.currentTarget.getBoundingClientRect()
    const { lng, lat } = map.unproject([event.clientX - rect.left, event.clientY - rect.top])
    if (draggingId === BUILD_PENDING_LAYER) {
      moveBuildPending({ longitude: lng, latitude: lat })
      return
    }
    movePoi(draggingId, lng, lat)
  }

  const endMarkerDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingId) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    setDraggingId(null)
  }

  const onHover = (info: PickingInfo) => {
    const id = info.layer?.id
    if (draggingId) return
    const overAdded = id === ADDED_POI_LAYER && Boolean(info.object)
    const overBuildPending = building && id === BUILD_PENDING_LAYER && Boolean(info.object)
    const overMarker = overAdded || overBuildPending
    markerUnderPointer.current = overBuildPending
      ? BUILD_PENDING_LAYER
      : overAdded
        ? (info.object as PointOfInterest).id
        : null
    const dragPan = mapRef.current?.getMap().dragPan
    if (overMarker) dragPan?.disable()
    else dragPan?.enable()
    if (overBuildPending) {
      hoverStation(null)
      hoverZone(null)
      setHover(null)
      return
    }
    if (overAdded) {
      hoverZone(null)
      setHover(place({ kind: 'poi', poi: info.object as PointOfInterest }, info, 240, 60))
      return
    }
    if (id === 'stations' && info.object) {
      const station = info.object as Station
      hoverStation(station.id)
      hoverZone(null)
      setHover(place({ kind: 'station', station }, info, 240, 60))
      return
    }
    hoverStation(null)
    if ((id === 'pois' || id === 'pois-hit') && info.object) {
      hoverZone(null)
      setHover(place({ kind: 'poi', poi: info.object as PointOfInterest }, info, 240, 60))
      return
    }
    if (id === 'zone-impacts' && info.object) {
      const feature = info.object as ZoneFeature
      hoverZone(feature.properties.impact?.delayMinutes ? feature.properties.zone.id : null)
      setHover(place({ kind: 'zone', feature, gain: feature.properties.shade === 'gain' }, info, 240, 90))
      return
    }
    hoverZone(null)
    setHover(null)
  }

  const onClick = (info: PickingInfo) => {
    const id = info.layer?.id
    if (building) {
      // Build tab: clicks select existing nodes or place the new one; no scenario popovers.
      setPopover(null)
      setPoiPopover(null)
      if (id === 'stations' && info.object) {
        selectBuildTarget(info.object as Station)
        return
      }
      if (id === BUILD_PENDING_LAYER) return
      if (buildPending) {
        selectBuildTarget(null)
        return
      }
      if (info.coordinate) {
        setBuildPending({ longitude: info.coordinate[0], latitude: info.coordinate[1] })
      }
      return
    }
    if (id === 'stations' && info.object) {
      const station = info.object as Station
      selectStation(station.id)
      setPoiPopover(null)
      setPopover(place(station.id, info, 300, 130))
      return
    }
    setPopover(null)
    if ((id === 'pois' || id === 'pois-hit') && info.object) {
      setHover(null)
      setPoiPopover(place(info.object as PointOfInterest, info, 360, 320))
      return
    }
    setPoiPopover(null)
    if (id === 'zone-impacts' && info.object) {
      const feature = info.object as ZoneFeature
      const traces =
        feature.properties.shade === 'gain'
          ? additionResult?.traces
          : disruptionResult?.traces ?? result?.traces
      if (traces?.[feature.properties.zone.id]) {
        const zoneId = feature.properties.zone.id
        selectZone(zoneId === selectedZoneId ? null : zoneId)
      }
    }
  }


  return (
    <div
      ref={frameRef}
      className="absolute inset-0"
      onPointerDownCapture={startMarkerDrag}
      onPointerMove={moveMarker}
      onPointerUp={endMarkerDrag}
      onPointerCancel={endMarkerDrag}
      onPointerLeave={() => {
        if (!draggingId) mapRef.current?.getMap().dragPan.enable()
        setHover(null)
        hoverZone(null)
        hoverStation(null)
      }}
    >
      <MapView
        ref={mapRef}
        mapStyle={MAP_STYLE}
        initialViewState={ATLANTA_VIEW}
        attributionControl={{ compact: true }}
        maxPitch={0}
        dragRotate={false}
        touchPitch={false}
        pitchWithRotate={false}
        onLoad={(event) => {
          const map = event.target
          softenBasemapRoads(map)
          map.on('style.load', () => softenBasemapRoads(map))
        }}
        onMove={(event) => setMapZoom(event.viewState.zoom)}
        onMoveEnd={(event) => setMapCenter(event.viewState.longitude, event.viewState.latitude)}
        reuseMaps
        style={{ width: '100%', height: '100%' }}
      >
        <DeckOverlay
          layers={layers}
          interleaved={false}
          pickingRadius={8}
          getCursor={({ isHovering, isDragging }) =>
            isDragging ? 'grabbing' : isHovering ? 'pointer' : building ? 'crosshair' : 'grab'
          }
          onHover={onHover}
          onClick={onClick}
        />
      </MapView>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgb(5_7_11/0.55))]" />

      <div className="pointer-events-auto absolute top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2">
        <Segmented
          className="glass rounded-xl"
          value={appMode}
          onChange={setAppMode}
          options={[
            {
              value: 'disrupt',
              label: 'Disrupt',
              idleClass: 'text-fog-400 hover:bg-red-500/15 hover:text-red-200 hover:ring-1 hover:ring-red-400/40',
              activeClass: 'bg-ink-700 text-fog-100 shadow-sm hover:bg-red-500/15 hover:text-red-200 hover:ring-1 hover:ring-red-400/40',
            },
            {
              value: 'add',
              label: 'Plan',
              idleClass: 'text-fog-400 hover:bg-emerald-500/15 hover:text-emerald-300 hover:ring-1 hover:ring-emerald-400/40',
              activeClass: 'bg-ink-700 text-fog-100 shadow-sm hover:bg-emerald-500/15 hover:text-emerald-300 hover:ring-1 hover:ring-emerald-400/40',
            },
            {
              value: 'intel',
              label: 'Intelligence',
              idleClass: 'text-fog-400 hover:bg-blue-500/15 hover:text-blue-200 hover:ring-1 hover:ring-blue-400/40',
              activeClass: 'bg-ink-700 text-fog-100 shadow-sm hover:bg-blue-500/15 hover:text-blue-200 hover:ring-1 hover:ring-blue-400/40',
            },
            {
              value: 'build',
              label: 'Report',
              idleClass: 'text-fog-400 hover:bg-yellow-400/15 hover:text-yellow-200 hover:ring-1 hover:ring-yellow-300/40',
              activeClass: 'bg-ink-700 text-fog-100 shadow-sm hover:bg-yellow-400/15 hover:text-yellow-200 hover:ring-1 hover:ring-yellow-300/40',
            },
          ]}
        />
      </div>

      {hover && !activePopover && !poiPopover && (
        <div
          className="glass pointer-events-none absolute z-30 max-w-[260px] rounded-xl px-3 py-2"
          style={{ left: hover.left, top: hover.top }}
        >
          <TooltipBody
            hover={hover.item}
            stationStates={stationStates}
            hospitalLoad={hover.item.kind === 'poi' ? hospitalLoadById.get(hover.item.poi.id) ?? null : null}
            building={building}
          />
        </div>
      )}

      {activePopover && (
        <StationPopover
          id={activePopover.item}
          position={{ left: activePopover.left, top: activePopover.top }}
          onClose={() => setPopover(null)}
        />
      )}

      {poiPopover && (
        <PoiPopover
          poi={poiPopover.item}
          position={{ left: poiPopover.left, top: poiPopover.top }}
          onClose={() => setPoiPopover(null)}
        />
      )}

      {(disruptionResult || (showPlanGain && additionResult)) && (
        <div
          className="pointer-events-auto absolute left-1/2 z-20 flex -translate-x-1/2 items-end gap-2 transition-[bottom] duration-300"
          style={{ bottom: 'var(--timeline-clearance, 4.75rem)' }}
        >
          {disruptionResult && (
            <div className="glass rounded-xl px-3 py-2">
              <div className="eyebrow mb-1.5">Added travel time (min)</div>
              <div className="flex gap-1">
                {IMPACT_BREAKS.map((bucket) => (
                  <div key={bucket.label} className="flex flex-col items-center gap-1">
                    <span className="h-1.5 w-12 rounded-sm" style={{ background: hex(bucket.color) }} />
                    <span className="font-mono text-[9.5px] text-fog-400">{bucket.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {maxCapacityIds.size > 0 && (
            <div className="glass flex items-center gap-2 rounded-xl px-3 py-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff4e60] ring-2 ring-[#ffd6a0]" />
              <span className="text-[11px] text-fog-200">Projected hospital overload</span>
            </div>
          )}
          {showPlanGain && additionResult && (
            <div className="glass rounded-xl px-3 py-2">
              <div className="eyebrow mb-1.5">Travel time saved (min)</div>
              <div className="flex gap-1">
                {GAIN_BREAKS.map((bucket) => (
                  <div key={bucket.label} className="flex flex-col items-center gap-1">
                    <span className="h-1.5 w-12 rounded-sm" style={{ background: hex(bucket.color) }} />
                    <span className="font-mono text-[9.5px] text-fog-400">{bucket.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {gain && intelEvent && intelEvent.recommendedFacilities.length > 0 && (
        <div className="glass pointer-events-none absolute right-4 bottom-16 z-20 max-w-[240px] rounded-xl px-3 py-2">
          <p className="text-[12px] leading-relaxed text-fog-200">
            <span className="text-fog-400">Try adding: </span>
            {intelAddLabels(intelEvent.recommendedFacilities)}
          </p>
        </div>
      )}
    </div>
  )
}

function intelAddLabels(facilities: { category: string }[]): string {
  const seen = new Set<string>()
  const labels: string[] = []
  for (const item of facilities) {
    const key = item.category.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    labels.push(categoryMeta(key as PoiCategory)?.label ?? item.category)
    if (labels.length === 4) break
  }
  return labels.join(', ')
}

function TooltipBody({
  hover,
  stationStates,
  hospitalLoad,
  building,
}: {
  hover: Hover
  stationStates: Record<string, string>
  hospitalLoad: HospitalCapacity | null
  building: boolean
}) {
  if (hover.kind === 'station') {
    const { station } = hover
    const state = building ? undefined : stationStates[station.id]
    return (
      <>
        <div className="flex items-center gap-2 text-[13px] font-medium">
          {station.name}
          <span className="flex gap-0.5">
            {station.lines.map((line) => (
              <span key={line} className="h-1 w-3 rounded-full" style={{ background: MARTA_LINE_HEX[line] }} />
            ))}
          </span>
        </div>
        <div className={`text-[11px] ${state === 'shutdown' ? 'text-shut' : state === 'maintenance' ? 'text-maint' : 'text-fog-500'}`}>
          {state === 'shutdown'
            ? 'Shut down'
            : state === 'maintenance'
              ? 'Maintenance'
              : building
                ? 'Click to select'
                : 'Click to change state'}
        </div>
      </>
    )
  }
  if (hover.kind === 'poi') {
    const meta = categoryMeta(hover.poi.category)
    return (
      <>
        <div className="text-[13px] font-medium">{hover.poi.name}</div>
        <div className="text-[11px]" style={{ color: hex(categoryRgb(hover.poi.category)) }}>
          {meta?.label ?? hover.poi.category}
        </div>
        {hospitalLoad?.atMaxCapacity && hospitalLoad.loadRatio != null && (
          <div className="mt-1 text-[11px] text-[#ffd6a0]">
            Projected overload · {Math.round(hospitalLoad.loadRatio * 100)}% occupied-equivalent
            {hospitalLoad.overflowPatients > 0 &&
              ` · ${hospitalLoad.overflowPatients.toFixed(2)} patients above beds`}
          </div>
        )}
      </>
    )
  }
  const { zone, impact } = hover.feature.properties
  const zoneGain = hover.gain
  return (
    <>
      <div className="text-[13px] font-medium">{zone.name}</div>
      <div className="font-mono text-[10.5px] text-fog-500">
        {formatPopulation(zone.population)} residents
        {zone.medianIncome != null && ` · $${Math.round(zone.medianIncome / 1000)}k median income`}
      </div>
      {impact && impact.delayMinutes > 0 ? (
        <div className="mt-1.5 flex items-baseline gap-2 font-mono text-[11px]">
          <span className="text-fog-400">{impact.normalTravelMinutes}</span>
          <span className="text-fog-500">→</span>
          <span className="text-fog-100">{impact.disruptedTravelMinutes} min</span>
          <span
            className="ml-auto"
            style={{ color: zoneGain ? gainHex(impact.delayMinutes) : delayHex(impact.delayMinutes) }}
          >
            {zoneGain ? '−' : '+'}
            {impact.delayMinutes}
          </span>
        </div>
      ) : impact ? (
        <div className="mt-1 text-[11px] text-fog-500">Unaffected</div>
      ) : null}
    </>
  )
}

function HospitalStatus({ poiId }: { poiId: string }) {
  const result = useScenarioStore((state) => state.result)
  const disruptionResult = useScenarioStore((state) => state.disruptionResult)
  const loads =
    result?.hospitalCapacity && result.hospitalCapacity.length > 0
      ? result.hospitalCapacity
      : (disruptionResult?.hospitalCapacity ?? [])
  const load = loads.find((item) => item.poiId === poiId)
  if (!load || load.loadRatio == null || load.capacity == null || load.demand == null) return null
  return (
    <div className={`mt-1.5 text-[11.5px] leading-relaxed ${load.atMaxCapacity ? 'text-[#ffd6a0]' : 'text-fog-400'}`}>
      <p>
        Projected {Math.round(load.loadRatio * 100)}% occupied · {Math.round(load.demand)} of{' '}
        {load.capacity} beds
      </p>
      <p>
        +{load.addedDemand.toFixed(2)} closure admissions still occupying beds
        {load.overflowPatients > 0 && ` · ${load.overflowPatients.toFixed(2)} overflow`}
      </p>
      {load.baselineOccupancyRate != null && (
        <p className="text-[10px] text-fog-500">
          Starts from {Math.round(load.baselineOccupancyRate * 100)}% historical CMS occupancy
          {load.utilizationReportEnd ? ` · report ending ${load.utilizationReportEnd}` : ''}
        </p>
      )}
    </div>
  )
}

function PoiPopover({
  poi,
  position,
  onClose,
}: {
  poi: PointOfInterest
  position: { left: number; top: number }
  onClose: () => void
}) {
  const critical = useScenarioStore((state) => state.poiCriticalById[poi.id])
  const progress = useScenarioStore((state) => state.poiCriticalProgress)
  const stationStates = useScenarioStore((state) => state.stationStates)
  const appMode = useScenarioStore((state) => state.appMode)
  const setAppMode = useScenarioStore((state) => state.setAppMode)
  const setStationState = useScenarioStore((state) => state.setStationState)
  const closed = useScenarioStore((state) => Boolean(state.closedPoiIds[poi.id]))
  const togglePoiClosed = useScenarioStore((state) => state.togglePoiClosed)
  const incoming = useScenarioStore((state) =>
    (state.result ?? state.disruptionResult)?.poiPressure.find((item) => item.poiId === poi.id),
  )
  const meta = categoryMeta(poi.category)
  const analyzing = progress < 1
  const pressure = critical?.pressure ?? []
  const access = critical?.access ?? []

  const simulate = (stationId: string, status: 'maintenance' | 'shutdown') => {
    if (stationStates[stationId] === status) {
      setStationState(stationId, 'normal')
      return
    }
    if (appMode !== 'disrupt') setAppMode('disrupt')
    setStationState(stationId, status)
  }

  return (
    <div
      className="glass absolute z-30 w-[360px] animate-rise rounded-2xl p-3"
      style={position}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="text-[13px] font-medium">{poi.name}</div>
          <div className="text-[11px]" style={{ color: hex(categoryRgb(poi.category)) }}>
            {meta?.label ?? poi.category}
          </div>
          {poi.category === 'hospital' && (
            <div className="mt-0.5 text-[10.5px] text-fog-500" title={poi.capacitySource ?? undefined}>
              {poi.capacity != null ? `${poi.capacity} CMS beds` : 'Bed capacity unknown'}
            </div>
          )}
          <HospitalStatus poiId={poi.id} />
          {closed ? (
            <div className="mt-1 text-[11.5px] text-shut">
              Shut down: residents who used it now go to the next-closest one.
            </div>
          ) : (
            incoming && (
              <div className="mt-1 text-[11.5px] text-[#ffd6a0]">
                Under pressure: {incoming.addedRegions} more {incoming.addedRegions === 1 ? 'area' : 'areas'} now
                come here (+{formatVisitorRate(incoming.addedDemand)} visitors)
              </div>
            )
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-fog-500 hover:bg-white/5 hover:text-fog-100"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <button
        type="button"
        aria-pressed={closed}
        onClick={() => {
          if (!closed && appMode === 'intel') setAppMode('disrupt')
          togglePoiClosed(poi.id)
        }}
        className={
          closed
            ? 'mb-3 w-full rounded-lg bg-shut/20 px-2 py-1.5 text-[11.5px] text-fog-100 ring-1 ring-shut/60 hover:bg-shut/10'
            : 'mb-3 w-full rounded-lg px-2 py-1.5 text-[11.5px] text-shut ring-1 ring-shut/40 hover:bg-shut/10'
        }
      >
        {closed ? `Restore ${poi.name}` : `Shut down ${poi.name}`}
      </button>

      <div className="eyebrow mb-1.5">Station failures that add pressure here</div>
      {pressure.length > 0 ? (
        <StationImpactList
          items={pressure}
          stationStates={stationStates}
          onSimulate={simulate}
          describe={(item) => `+${formatPopulation(item.redirectedResidents)} residents redirected here`}
        />
      ) : (
        <p className="text-[11.5px] text-fog-500">
          {analyzing
            ? 'Still testing stations…'
            : 'This location is not at risk of failure.'}
        </p>
      )}

      {access.length > 0 && (
        <>
          <div className="eyebrow mt-3 mb-1.5">Station failures that slow trips here</div>
          <StationImpactList
            items={access.slice(0, 3)}
            stationStates={stationStates}
            onSimulate={simulate}
            describe={(item) =>
              `${formatPopulation(Math.round(item.delayedResidentMinutes))} added resident-minutes`
            }
          />
        </>
      )}

      {analyzing && (
        <div className="mt-2.5">
          <div className="mb-1 flex items-center justify-between text-[10.5px] text-fog-500">
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Testing station closures
            </span>
            <span className="font-mono">{Math.round(progress * 100)}%</span>
          </div>
          <ProgressBar value={progress} />
        </div>
      )}
    </div>
  )
}


function StationImpactList({
  items,
  stationStates,
  onSimulate,
  describe,
}: {
  items: PoiStationPressure[]
  stationStates: Record<string, string>
  onSimulate: (stationId: string, status: 'maintenance' | 'shutdown') => void
  describe: (item: PoiStationPressure) => string
}) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const state = stationStates[item.stationId]
        return (
          <li
            key={item.stationId}
            className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-2 py-1.5"
          >
            <div className="min-w-0">
              <div className="truncate text-[12px] text-fog-100">{item.stationName}</div>
              <div className="font-mono text-[10.5px] text-fog-500">{describe(item)}</div>
            </div>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                aria-pressed={state === 'maintenance'}
                onClick={() => onSimulate(item.stationId, 'maintenance')}
                className={
                  state === 'maintenance'
                    ? 'rounded-md bg-maint/20 px-2 py-1 text-[10.5px] text-fog-100 ring-1 ring-maint/60 hover:bg-maint/10'
                    : 'rounded-md px-2 py-1 text-[10.5px] text-maint ring-1 ring-maint/40 hover:bg-maint/10'
                }
              >
                {state === 'maintenance' ? 'Restore' : 'Maintenance'}
              </button>
              <button
                type="button"
                aria-pressed={state === 'shutdown'}
                onClick={() => onSimulate(item.stationId, 'shutdown')}
                className={
                  state === 'shutdown'
                    ? 'rounded-md bg-shut/20 px-2 py-1 text-[10.5px] text-fog-100 ring-1 ring-shut/60 hover:bg-shut/10'
                    : 'rounded-md px-2 py-1 text-[10.5px] text-shut ring-1 ring-shut/40 hover:bg-shut/10'
                }
              >
                {state === 'shutdown' ? 'Restore' : 'Shut down'}
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function StationPopover({
  id,
  position,
  onClose,
}: {
  id: string
  position: { left: number; top: number }
  onClose: () => void
}) {
  const station = useScenarioStore((state) => state.stations.find((item) => item.id === id))
  if (!station) return null
  return (
    <div
      className="glass absolute z-30 w-[300px] animate-rise rounded-2xl p-3"
      style={position}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] font-medium">
          {station.name}
          <span className="flex gap-0.5">
            {station.lines.map((line) => (
              <span key={line} className="h-1 w-3 rounded-full" style={{ background: MARTA_LINE_HEX[line] }} />
            ))}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-fog-500 hover:bg-white/5 hover:text-fog-100"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <StationStatePicker stationId={station.id} />
    </div>
  )
}
