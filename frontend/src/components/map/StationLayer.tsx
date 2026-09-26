import { ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import type { Station } from '@/types/network'

const LABEL_PATTERN =
  /Airport|West End|Five Points|North Ave|Arts Center|Lindbergh|Buckhead|East Lake|Oakland City|King Memorial|Midtown|Peachtree Center/i

function shouldLabel(station: Station) {
  return station.lines.length > 2 || LABEL_PATTERN.test(station.name)
}

export function createStationLayers(
  stations: Station[],
  selectedStationId: string,
  failedStationIds: string[],
  pulse: number,
  onClickStation: (id: string) => void,
) {
  const failed = new Set(failedStationIds)

  const nodes = new ScatterplotLayer<Station>({
    id: 'stations',
    data: stations,
    getPosition: (d) => [d.longitude, d.latitude],
    getRadius: (d) => {
      if (failed.has(d.id)) return 8 + pulse * 4
      if (d.id === selectedStationId) return 7
      if (d.lines.length > 2) return 6
      return 4.5
    },
    radiusUnits: 'pixels',
    getFillColor: (d) => {
      if (failed.has(d.id)) return [227, 24, 55, 255]
      if (d.id === selectedStationId) return [96, 165, 250, 255]
      return [232, 238, 245, 245]
    },
    getLineColor: (d) => (failed.has(d.id) ? [255, 180, 180, 255] : [11, 18, 32, 220]),
    lineWidthMinPixels: 1.5,
    stroked: true,
    pickable: true,
    onClick: (info) => {
      if (info.object) onClickStation(info.object.id)
    },
  })

  const halo = new ScatterplotLayer<Station>({
    id: 'failed-halo',
    data: stations.filter((station) => failed.has(station.id)),
    getPosition: (d) => [d.longitude, d.latitude],
    getRadius: 16 + pulse * 10,
    radiusUnits: 'pixels',
    getFillColor: [227, 24, 55, 40],
    stroked: false,
    pickable: false,
  })

  const failedMark = new TextLayer<Station>({
    id: 'failed-mark',
    data: stations.filter((station) => failed.has(station.id)),
    getPosition: (d) => [d.longitude, d.latitude],
    getText: () => '×',
    getSize: 16,
    getColor: [255, 255, 255, 255],
    fontFamily: 'IBM Plex Sans, sans-serif',
    fontWeight: 600,
    getTextAnchor: 'middle',
    getAlignmentBaseline: 'center',
  })

  const labels = new TextLayer<Station>({
    id: 'station-labels',
    data: stations.filter(shouldLabel),
    getPosition: (d) => [d.longitude, d.latitude],
    getText: (d) => (failed.has(d.id) ? `${d.name}  ·  Offline` : d.name),
    getSize: 11,
    getColor: (d) =>
      failed.has(d.id) ? [255, 210, 210, 255] : [183, 195, 211, 230],
    getPixelOffset: [0, -14],
    fontFamily: 'IBM Plex Sans, sans-serif',
    fontWeight: 500,
    getTextAnchor: 'middle',
    getAlignmentBaseline: 'bottom',
  })

  return [halo, nodes, failedMark, labels]
}
