import '@/maplibreSetup'
import { MapboxOverlay } from '@deck.gl/mapbox'
import type { MapboxOverlayProps } from '@deck.gl/mapbox'
import type { LayersList, PickingInfo } from '@deck.gl/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Map, NavigationControl, useControl, type MapRef } from 'react-map-gl/maplibre'
import { createMartaNetworkLayer } from '@/components/map/MartaNetworkLayer'
import { MapLegend } from '@/components/map/MapLegend'
import { createPoiLayers } from '@/components/map/PoiLayer'
import { createRouteLayers } from '@/components/map/RouteLayer'
import { createStationLayers } from '@/components/map/StationLayer'
import { createZoneImpactLayer } from '@/components/map/ZoneImpactLayer'
import { MapStationEditor } from '@/components/scenario/StationStateControl'
import { useScenarioStore } from '@/store/scenarioStore'
import type { Station, StationOperatingState } from '@/types/network'
import { ATLANTA_VIEW, MAP_STYLE } from '@/utils/constants'
import { cn } from '@/utils/cn'
import 'maplibre-gl/dist/maplibre-gl.css'

const TIP_COPY: Record<StationOperatingState, string> = {
  normal: 'Normal',
  maintenance: 'Maintenance · trains pass through',
  shutdown: 'Shut down · trains cannot pass',
}

function DeckOverlay(props: MapboxOverlayProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props))
  overlay.setProps(props)
  return null
}

function asStation(object: unknown): Station | null {
  if (!object || typeof object !== 'object' || !('lines' in object)) return null
  const candidate = object as Station
  if (!Array.isArray(candidate.lines) || typeof candidate.name !== 'string') return null
  return candidate
}

export function CivicMap() {
  const mapRef = useRef<MapRef>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const tipIdRef = useRef<string | null>(null)
  const [editor, setEditor] = useState<{ id: string; x: number; y: number } | null>(null)
  const stations = useScenarioStore((state) => state.stations)
  const stationStates = useScenarioStore((state) => state.stationStates)
  const transitEdges = useScenarioStore((state) => state.transitEdges)
  const zones = useScenarioStore((state) => state.zones)
  const pois = useScenarioStore((state) => state.pois)
  const selectedStationId = useScenarioStore((state) => state.selectedStationId)
  const setSelectedStation = useScenarioStore((state) => state.setSelectedStation)
  const selectedServiceCategories = useScenarioStore((state) => state.selectedServiceCategories)
  const simulationResult = useScenarioStore((state) => state.simulationResult)
  const simulationStatus = useScenarioStore((state) => state.simulationStatus)
  const selectedZoneId = useScenarioStore((state) => state.selectedZoneId)
  const selectedPoiId = useScenarioStore((state) => state.selectedPoiId)
  const traceImpact = useScenarioStore((state) => state.traceImpact)
  const beforeAfterMode = useScenarioStore((state) => state.beforeAfterMode)
  const selectZone = useScenarioStore((state) => state.selectZone)
  const focusRequest = useScenarioStore((state) => state.focusRequest)
  const statesRef = useRef(stationStates)
  statesRef.current = stationStates

  const simulated = simulationStatus === 'success'
  const { maintenanceIds, shutdownIds } = useMemo(() => {
    const maintenanceIds: string[] = []
    const shutdownIds: string[] = []
    for (const [id, status] of Object.entries(stationStates)) {
      if (status === 'maintenance') maintenanceIds.push(id)
      if (status === 'shutdown') shutdownIds.push(id)
    }
    return { maintenanceIds, shutdownIds }
  }, [stationStates])

  const hideTip = () => {
    tipIdRef.current = null
    const el = tipRef.current
    if (el) el.style.opacity = '0'
  }

  const paintTip = (station: Station, x: number, y: number) => {
    const el = tipRef.current
    if (!el) return
    const status = statesRef.current[station.id] ?? 'normal'
    const name = el.querySelector('[data-tip-name]')
    const state = el.querySelector('[data-tip-state]')
    if (name) name.textContent = station.name
    if (state) {
      state.textContent = TIP_COPY[status]
      state.className = cn(
        'text-[11px]',
        status === 'shutdown' && 'text-line-red',
        status === 'maintenance' && 'text-line-gold',
        status === 'normal' && 'text-fog-400',
      )
    }
    tipIdRef.current = station.id
    const width = frameRef.current?.clientWidth ?? 800
    const height = frameRef.current?.clientHeight ?? 600
    const left = Math.min(Math.max(8, x + 14), Math.max(8, width - 220))
    const top = Math.min(Math.max(8, y + 14), Math.max(8, height - 56))
    el.style.opacity = '1'
    el.style.transform = `translate3d(${left}px, ${top}px, 0)`
  }

  useEffect(() => {
    const id = tipIdRef.current
    if (!id) return
    const station = stations.find((item) => item.id === id)
    if (!station || !tipRef.current) return
    const state = tipRef.current.querySelector('[data-tip-state]')
    const status = stationStates[id] ?? 'normal'
    if (state) {
      state.textContent = TIP_COPY[status]
      state.className = cn(
        'text-[11px]',
        status === 'shutdown' && 'text-line-red',
        status === 'maintenance' && 'text-line-gold',
        status === 'normal' && 'text-fog-400',
      )
    }
  }, [stationStates, stations])

  useEffect(() => {
    setEditor((current) => (current && current.id !== selectedStationId ? null : current))
  }, [selectedStationId])

  useEffect(() => {
    if (!focusRequest) return
    mapRef.current?.flyTo({
      center: [focusRequest.longitude, focusRequest.latitude],
      zoom: focusRequest.zoom,
      duration: 700,
      essential: true,
    })
  }, [focusRequest])

  const onHover = (info: PickingInfo) => {
    const station = asStation(info.object)
    if (!station) {
      hideTip()
      return
    }
    paintTip(station, info.x, info.y)
  }

  const onClick = (info: PickingInfo) => {
    const station = asStation(info.object)
    if (station) {
      setSelectedStation(station.id)
      setEditor({ id: station.id, x: info.x, y: info.y })
      return
    }
    if (!info.object) setEditor(null)
  }

  const layers = useMemo<LayersList>(() => {
    const showNormal =
      Boolean(traceImpact) && (beforeAfterMode === 'both' || beforeAfterMode === 'normal')
    const showDisrupted =
      Boolean(traceImpact) && (beforeAfterMode === 'both' || beforeAfterMode === 'disrupted')

    return [
      createZoneImpactLayer(
        zones,
        simulationResult?.zoneImpacts ?? [],
        selectedZoneId,
        simulated,
        (zoneId) => {
          if (simulated) selectZone(zoneId)
        },
      ),
      createMartaNetworkLayer(transitEdges, stations, shutdownIds),
      ...createRouteLayers(
        showNormal ? traceImpact?.normalPath : null,
        showDisrupted ? traceImpact?.disruptedPath : null,
      ),
      ...createPoiLayers(
        pois,
        selectedServiceCategories,
        selectedPoiId,
        Boolean(traceImpact),
        simulationResult?.poiPressure ?? [],
      ),
      ...createStationLayers(stations, selectedStationId, maintenanceIds, shutdownIds),
    ]
  }, [
    beforeAfterMode,
    maintenanceIds,
    pois,
    selectZone,
    selectedPoiId,
    selectedServiceCategories,
    selectedStationId,
    selectedZoneId,
    shutdownIds,
    simulated,
    simulationResult,
    stations,
    traceImpact,
    transitEdges,
    zones,
  ])

  const editorPosition = (() => {
    if (!editor) return null
    const width = frameRef.current?.clientWidth ?? 800
    const height = frameRef.current?.clientHeight ?? 600
    return {
      left: Math.min(Math.max(8, editor.x + 14), Math.max(8, width - 272)),
      top: Math.min(Math.max(8, editor.y + 12), Math.max(8, height - 150)),
    }
  })()

  return (
    <div
      ref={frameRef}
      className="relative h-full w-full"
      onPointerLeave={hideTip}
    >
      <Map
        ref={mapRef}
        mapStyle={MAP_STYLE}
        initialViewState={ATLANTA_VIEW}
        attributionControl={{ compact: true }}
        reuseMaps
        style={{ width: '100%', height: '100%' }}
      >
        <DeckOverlay
          layers={layers}
          interleaved={false}
          pickingRadius={6}
          getCursor={({ isHovering }) => (isHovering ? 'pointer' : 'grab')}
          onHover={onHover}
          onClick={onClick}
        />
        <NavigationControl position="bottom-left" showCompass={false} />
      </Map>
      <div
        ref={tipRef}
        className="pointer-events-none absolute top-0 left-0 z-30 rounded-xl border border-ink-600 bg-ink-900/95 px-3 py-2 opacity-0 shadow-xl"
      >
        <div data-tip-name className="text-sm font-medium text-fog-100" />
        <div data-tip-state className="text-[11px] text-fog-400" />
      </div>
      {editor && editorPosition && (
        <MapStationEditor
          stationId={editor.id}
          x={editorPosition.left}
          y={editorPosition.top}
          onClose={() => setEditor(null)}
        />
      )}
      <MapLegend simulated={simulated} />
    </div>
  )
}
