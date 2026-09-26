import '@/maplibreSetup'
import { MapboxOverlay } from '@deck.gl/mapbox'
import type { MapboxOverlayProps } from '@deck.gl/mapbox'
import type { LayersList } from '@deck.gl/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Map, NavigationControl, useControl, type MapRef } from 'react-map-gl/maplibre'
import { createMartaNetworkLayer } from '@/components/map/MartaNetworkLayer'
import { MapLegend } from '@/components/map/MapLegend'
import { createPoiLayers } from '@/components/map/PoiLayer'
import { createRouteLayers } from '@/components/map/RouteLayer'
import { createStationLayers } from '@/components/map/StationLayer'
import { createZoneImpactLayer } from '@/components/map/ZoneImpactLayer'
import { useScenarioStore } from '@/store/scenarioStore'
import { ATLANTA_VIEW, MAP_STYLE } from '@/utils/constants'
import 'maplibre-gl/dist/maplibre-gl.css'

function DeckOverlay(props: MapboxOverlayProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props))
  overlay.setProps(props)
  return null
}

export function CivicMap() {
  const mapRef = useRef<MapRef>(null)
  const [pulse, setPulse] = useState(0)
  const stations = useScenarioStore((state) => state.stations)
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

  const simulated = simulationStatus === 'success'
  const failedStationIds = simulationResult?.failedStations ?? []

  useEffect(() => {
    if (!simulated) {
      setPulse(0)
      return
    }
    let frame = 0
    const start = performance.now()
    const loop = (now: number) => {
      const t = (now - start) / 1000
      setPulse((Math.sin(t * 2.4) + 1) / 2)
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [simulated])

  useEffect(() => {
    if (!focusRequest) return
    mapRef.current?.flyTo({
      center: [focusRequest.longitude, focusRequest.latitude],
      zoom: focusRequest.zoom,
      duration: 900,
      essential: true,
    })
  }, [focusRequest])

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
          if (simulated) void selectZone(zoneId)
        },
      ),
      createMartaNetworkLayer(transitEdges, stations, failedStationIds),
      ...createRouteLayers(
        showNormal ? traceImpact?.normalPath : null,
        showDisrupted ? traceImpact?.disruptedPath : null,
      ),
      ...createPoiLayers(
        pois,
        selectedServiceCategories,
        selectedPoiId,
        Boolean(traceImpact),
      ),
      ...createStationLayers(
        stations,
        selectedStationId,
        failedStationIds,
        pulse,
        setSelectedStation,
      ),
    ]
  }, [
    beforeAfterMode,
    failedStationIds,
    pois,
    pulse,
    selectZone,
    selectedPoiId,
    selectedServiceCategories,
    selectedStationId,
    selectedZoneId,
    setSelectedStation,
    simulated,
    simulationResult,
    stations,
    traceImpact,
    transitEdges,
    zones,
  ])

  return (
    <div className="relative h-full w-full">
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
          getCursor={({ isHovering }) => (isHovering ? 'pointer' : 'grab')}
        />
        <NavigationControl position="bottom-left" showCompass={false} />
      </Map>
      <MapLegend simulated={simulated} />
    </div>
  )
}
