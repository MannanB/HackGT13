import type { LayersList, PickingInfo } from '@deck.gl/core'
import { MapboxOverlay, type MapboxOverlayProps } from '@deck.gl/mapbox'
import { Box, Square, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Map, useControl, type MapRef } from 'react-map-gl/maplibre'
import { ADDED_POI_LAYER, createAddedPoiLayers } from '@/components/map/AddedPoiLayer'
import { LIVE_TRAIN_LAYER, createLiveTrainLayers, simulatedTrains, type SimTrain } from '@/components/map/LiveTrainLayer'
import { createMartaNetworkLayers } from '@/components/map/MartaNetworkLayer'
import { createPoiLayers } from '@/components/map/PoiLayer'
import { createRouteLayers } from '@/components/map/RouteLayer'
import { createStationLayers } from '@/components/map/StationLayer'
import { createZoneImpactLayer, zoneCollection, type ZoneFeature } from '@/components/map/ZoneImpactLayer'
import { StationStatePicker } from '@/components/scenario/StationStatePicker'
import { Segmented } from '@/components/ui/Segmented'
import { selectTrace, useScenarioStore } from '@/store/scenarioStore'
import type { PointOfInterest } from '@/types/geography'
import type { Station } from '@/types/network'
import type { PoiCriticalStation } from '@/types/simulation'
import { categoryMeta, categoryRgb } from '@/utils/categories'
import {
  ATLANTA_VIEW,
  GAIN_BREAKS,
  IMPACT_BREAKS,
  MAP_STYLE,
  MARTA_LINE_HEX,
  delayHex,
  formatPopulation,
  gainHex,
  hex,
} from '@/utils/constants'
import 'maplibre-gl/dist/maplibre-gl.css'

const PANEL_PADDING = { top: 40, bottom: 40, left: 380, right: 400 }

type Hover =
  | { kind: 'station'; station: Station }
  | { kind: 'zone'; feature: ZoneFeature }
  | { kind: 'poi'; poi: PointOfInterest }
  | { kind: 'train'; train: SimTrain }

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

  const stations = useScenarioStore((state) => state.stations)
  const transitEdges = useScenarioStore((state) => state.transitEdges)
  const zones = useScenarioStore((state) => state.zones)
  const pois = useScenarioStore((state) => state.pois)
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
  const setExtruded = useScenarioStore((state) => state.setExtruded)
  const poiCriticalById = useScenarioStore((state) => state.poiCriticalById)
  const appMode = useScenarioStore((state) => state.appMode)
  const setAppMode = useScenarioStore((state) => state.setAppMode)
  const addedPois = useScenarioStore((state) => state.addedPois)
  const movePoi = useScenarioStore((state) => state.movePoi)
  const setMapCenter = useScenarioStore((state) => state.setMapCenter)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const gain = appMode === 'add'
  const [simTime, setSimTime] = useState(0)

  const shutdownIds = useMemo(
    () => new Set(Object.keys(stationStates).filter((id) => stationStates[id] === 'shutdown')),
    [stationStates],
  )
  const zoneData = useMemo(() => zoneCollection(zones, result?.zoneImpacts ?? []), [zones, result])

  useEffect(() => {
    if (!focusRequest) return
    mapRef.current?.fitBounds(focusRequest.bounds, {
      padding: PANEL_PADDING,
      maxZoom: 13.5,
      duration: 900,
      essential: true,
    })
  }, [focusRequest])

  useEffect(() => {
    mapRef.current?.easeTo({ pitch: extruded ? 52 : 0, bearing: extruded ? -18 : 0, duration: 900 })
  }, [extruded])

  useEffect(() => {
    let raf = 0
    let last = 0
    const paint = (now: number) => {
      if (now - last > 90) {
        last = now
        setSimTime(now)
      }
      raf = window.requestAnimationFrame(paint)
    }
    raf = window.requestAnimationFrame(paint)
    return () => window.cancelAnimationFrame(raf)
  }, [])

  const simTrains = useMemo(
    () => simulatedTrains(stations, transitEdges, shutdownIds, simTime),
    [stations, transitEdges, shutdownIds, simTime],
  )

  const layers = useMemo<LayersList>(
    () => [
      createZoneImpactLayer({
        data: zoneData,
        selectedZoneId,
        hoveredZoneId,
        delayRange,
        extruded,
        gain,
      }),
      ...createMartaNetworkLayers(transitEdges, stations, shutdownIds),
      ...createPoiLayers({
        pois,
        categories,
        pressure: result?.poiPressure ?? [],
        tracePoiId: trace?.poiId ?? null,
      }),
      ...createRouteLayers(
        trace && routeView !== 'disrupted' ? trace.normalPath : null,
        trace && routeView !== 'normal' ? trace.disruptedPath : null,
      ),
      ...createStationLayers({
        stations,
        stationStates,
        selectedId: selectedStationId,
        hoveredId: hoveredStationId,
      }),
      ...(addedPois.length > 0 ? createAddedPoiLayers(addedPois, draggingId) : []),
      ...createLiveTrainLayers(simTrains),
    ],
    [
      zoneData, selectedZoneId, hoveredZoneId, delayRange, extruded, transitEdges, stations,
      shutdownIds, pois, categories, result, trace, routeView, stationStates, selectedStationId,
      hoveredStationId, gain, addedPois, draggingId, simTrains,
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
    const overMarker = id === ADDED_POI_LAYER && Boolean(info.object)
    markerUnderPointer.current = overMarker ? (info.object as PointOfInterest).id : null
    const dragPan = mapRef.current?.getMap().dragPan
    if (overMarker) dragPan?.disable()
    else dragPan?.enable()
    if (overMarker) {
      hoverZone(null)
      setHover(place({ kind: 'poi', poi: info.object as PointOfInterest }, info, 240, 60))
      return
    }
    if (id === LIVE_TRAIN_LAYER && info.object) {
      hoverStation(null)
      hoverZone(null)
      setHover(place({ kind: 'train', train: info.object as SimTrain }, info, 220, 56))
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
    if (id === 'pois' && info.object) {
      hoverZone(null)
      setHover(place({ kind: 'poi', poi: info.object as PointOfInterest }, info, 260, 96))
      return
    }
    if (id === 'zone-impacts' && info.object) {
      const feature = info.object as ZoneFeature
      hoverZone(feature.properties.impact?.delayMinutes ? feature.properties.zone.id : null)
      setHover(place({ kind: 'zone', feature }, info, 240, 90))
      return
    }
    hoverZone(null)
    setHover(null)
  }

  const onClick = (info: PickingInfo) => {
    const id = info.layer?.id
    if (id === 'stations' && info.object) {
      const station = info.object as Station
      selectStation(station.id)
      setPopover(place(station.id, info, 300, 130))
      return
    }
    setPopover(null)
    if (id === 'zone-impacts' && info.object) {
      const feature = info.object as ZoneFeature
      if (result?.traces[feature.properties.zone.id]) {
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
      <Map
        ref={mapRef}
        mapStyle={MAP_STYLE}
        initialViewState={ATLANTA_VIEW}
        attributionControl={{ compact: true }}
        maxPitch={70}
        onMoveEnd={(event) => setMapCenter(event.viewState.longitude, event.viewState.latitude)}
        reuseMaps
        style={{ width: '100%', height: '100%' }}
      >
        <DeckOverlay
          layers={layers}
          interleaved={false}
          pickingRadius={6}
          getCursor={({ isHovering, isDragging }) => (isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab')}
          onHover={onHover}
          onClick={onClick}
        />
      </Map>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgb(5_7_11/0.55))]" />

      <div className="pointer-events-auto absolute top-3 left-1/2 z-20 -translate-x-1/2">
        <Segmented
          className="glass rounded-xl"
          value={appMode}
          onChange={setAppMode}
          options={[
            { value: 'disrupt', label: 'Disrupt' },
            { value: 'add', label: 'Add new', activeClass: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/40' },
          ]}
        />
      </div>

      {hover && !activePopover && (
        <div
          className="glass pointer-events-none absolute z-30 max-w-[260px] rounded-xl px-3 py-2"
          style={{ left: hover.left, top: hover.top }}
        >
          <TooltipBody
            hover={hover.item}
            stationStates={stationStates}
            gain={gain}
            criticalStation={hover.item.kind === 'poi' ? poiCriticalById[hover.item.poi.id] : undefined}
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

      {result && (
        <div className="pointer-events-auto absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-end gap-2">
          <div className="glass rounded-xl px-3 py-2">
            <div className="eyebrow mb-1.5">{gain ? 'Travel time saved (min)' : 'Added travel time (min)'}</div>
            <div className="flex gap-1">
              {(gain ? GAIN_BREAKS : IMPACT_BREAKS).map((bucket) => (
                <div key={bucket.label} className="flex flex-col items-center gap-1">
                  <span className="h-1.5 w-12 rounded-sm" style={{ background: hex(bucket.color) }} />
                  <span className="font-mono text-[9.5px] text-fog-400">{bucket.label}</span>
                </div>
              ))}
            </div>
          </div>
          <Segmented
            className="glass rounded-xl"
            value={extruded ? '3d' : '2d'}
            onChange={(value) => setExtruded(value === '3d')}
            options={[
              { value: '2d', label: <><Square className="h-3 w-3" /> Flat</> },
              { value: '3d', label: <><Box className="h-3 w-3" /> Extrude delay</> },
            ]}
          />
        </div>
      )}
    </div>
  )
}

function TooltipBody({
  hover,
  stationStates,
  gain,
  criticalStation,
}: {
  hover: Hover
  stationStates: Record<string, string>
  gain: boolean
  criticalStation?: PoiCriticalStation
}) {
  if (hover.kind === 'station') {
    const { station } = hover
    const state = stationStates[station.id]
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
          {state === 'shutdown' ? 'Shut down' : state === 'maintenance' ? 'Maintenance' : 'Click to change state'}
        </div>
      </>
    )
  }
  if (hover.kind === 'train') {
    const { train } = hover
    return (
      <>
        <div className="flex items-center gap-2 text-[13px] font-medium">
          <span className="h-2 w-2 rounded-full" style={{ background: MARTA_LINE_HEX[train.line] }} />
          {train.line[0].toUpperCase()}
          {train.line.slice(1)} line
        </div>
        <div className="text-[11px] text-fog-400">Simulated · near {train.nextStation}</div>
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
        {criticalStation && (
          <div className="mt-1.5 text-[11px] leading-snug text-fog-400">
            {criticalStation.stationName} failing would cause the most increased stress to this
            facility
          </div>
        )}
      </>
    )
  }
  const { zone, impact } = hover.feature.properties
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
            style={{ color: gain ? gainHex(impact.delayMinutes) : delayHex(impact.delayMinutes) }}
          >
            {gain ? '−' : '+'}
            {impact.delayMinutes}
          </span>
        </div>
      ) : impact ? (
        <div className="mt-1 text-[11px] text-fog-500">Unaffected</div>
      ) : null}
    </>
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
