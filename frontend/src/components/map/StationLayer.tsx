import { ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import type { Station } from '@/types/network'

const LABEL_PATTERN =
  /Airport|West End|Five Points|North Ave|Arts Center|Lindbergh|Buckhead|East Lake|Oakland City|King Memorial|Midtown|Peachtree Center/i

function shouldLabel(
  station: Station,
  selectedStationId: string,
  maintenance: Set<string>,
  shutdown: Set<string>,
) {
  return (
    station.id === selectedStationId ||
    maintenance.has(station.id) ||
    shutdown.has(station.id) ||
    station.lines.length > 2 ||
    LABEL_PATTERN.test(station.name)
  )
}

export function createStationLayers(
  stations: Station[],
  selectedStationId: string,
  maintenanceIds: string[],
  shutdownIds: string[],
) {
  const maintenance = new Set(maintenanceIds)
  const shutdown = new Set(shutdownIds)
  const changed = stations.filter(
    (station) => maintenance.has(station.id) || shutdown.has(station.id),
  )

  const halo = new ScatterplotLayer<Station>({
    id: 'station-state-halo',
    data: changed,
    getPosition: (d) => [d.longitude, d.latitude],
    getRadius: (d) => (shutdown.has(d.id) ? 16 : 14),
    radiusUnits: 'pixels',
    getFillColor: (d) =>
      shutdown.has(d.id) ? [227, 24, 55, 55] : [240, 180, 41, 50],
    stroked: false,
    pickable: false,
  })

  const selected = stations.filter((station) => station.id === selectedStationId)
  const ring = new ScatterplotLayer<Station>({
    id: 'station-selected-ring',
    data: selected,
    getPosition: (d) => [d.longitude, d.latitude],
    getRadius: 15,
    radiusUnits: 'pixels',
    filled: false,
    stroked: true,
    getLineColor: [147, 197, 253, 255],
    lineWidthMinPixels: 2,
    pickable: false,
  })

  const nodes = new ScatterplotLayer<Station>({
    id: 'stations',
    data: stations,
    getPosition: (d) => [d.longitude, d.latitude],
    getRadius: (d) => {
      if (shutdown.has(d.id) || maintenance.has(d.id) || d.id === selectedStationId) return 9
      if (d.lines.length > 2) return 7
      return 6.5
    },
    radiusUnits: 'pixels',
    getFillColor: (d) => {
      if (shutdown.has(d.id)) return [227, 24, 55, 255]
      if (maintenance.has(d.id)) return [240, 180, 41, 255]
      if (d.id === selectedStationId) return [96, 165, 250, 255]
      return [232, 238, 245, 245]
    },
    getLineColor: [11, 18, 32, 230],
    lineWidthMinPixels: 1.5,
    stroked: true,
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 255, 255, 255],
  })

  const shutdownMark = new TextLayer<Station>({
    id: 'shutdown-mark',
    data: stations.filter((station) => shutdown.has(station.id)),
    getPosition: (d) => [d.longitude, d.latitude],
    getText: () => '×',
    getSize: 16,
    getColor: [255, 255, 255, 255],
    fontFamily: 'IBM Plex Sans, sans-serif',
    fontWeight: 600,
    getTextAnchor: 'middle',
    getAlignmentBaseline: 'center',
    pickable: false,
  })

  const labels = new TextLayer<Station>({
    id: 'station-labels',
    data: stations.filter((station) => shouldLabel(station, selectedStationId, maintenance, shutdown)),
    getPosition: (d) => [d.longitude, d.latitude],
    getText: (d) => {
      if (shutdown.has(d.id)) return `${d.name}  ·  Shut down`
      if (maintenance.has(d.id)) return `${d.name}  ·  Maintenance`
      return d.name
    },
    getSize: 11,
    getColor: (d) => {
      if (shutdown.has(d.id)) return [255, 210, 210, 255]
      if (maintenance.has(d.id)) return [255, 224, 150, 255]
      if (d.id === selectedStationId) return [210, 225, 255, 255]
      return [183, 195, 211, 230]
    },
    getPixelOffset: [0, -16],
    fontFamily: 'IBM Plex Sans, sans-serif',
    fontWeight: 500,
    getTextAnchor: 'middle',
    getAlignmentBaseline: 'bottom',
    pickable: false,
  })

  return [halo, ring, nodes, shutdownMark, labels]
}
