import { ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import type { Station, StationOperatingState } from '@/types/network'
import { STATE_RGB, type RGBA } from '@/utils/constants'

const HUBS = /Five Points|Airport|North Springs|Doraville|Holmes|Indian Creek|Bankhead|Lindbergh/i

export function createStationLayers({
  stations,
  stationStates,
  selectedId,
  hoveredId,
}: {
  stations: Station[]
  stationStates: Record<string, StationOperatingState>
  selectedId: string | null
  hoveredId: string | null
}) {
  const stateOf = (station: Station) => stationStates[station.id] ?? 'normal'
  const disrupted = stations.filter((station) => stateOf(station) !== 'normal')
  const focused = stations.filter((station) => station.id === selectedId || station.id === hoveredId)
  const labeled = stations.filter(
    (station) =>
      station.id === selectedId ||
      station.id === hoveredId ||
      stateOf(station) !== 'normal' ||
      HUBS.test(station.name),
  )
  const triggers = [stationStates, selectedId, hoveredId]

  return [
    new ScatterplotLayer<Station>({
      id: 'station-halo',
      data: disrupted,
      getPosition: (d) => [d.longitude, d.latitude],
      getRadius: 16,
      radiusUnits: 'pixels',
      getFillColor: (d) => [...STATE_RGB[stateOf(d) === 'shutdown' ? 'shutdown' : 'maintenance'], 40],
      getLineColor: (d) => [...STATE_RGB[stateOf(d) === 'shutdown' ? 'shutdown' : 'maintenance'], 140],
      stroked: true,
      lineWidthMinPixels: 1,
      updateTriggers: { getFillColor: triggers, getLineColor: triggers },
    }),
    new ScatterplotLayer<Station>({
      id: 'station-focus',
      data: focused,
      getPosition: (d) => [d.longitude, d.latitude],
      getRadius: 13,
      radiusUnits: 'pixels',
      filled: false,
      stroked: true,
      getLineColor: (d) => (d.id === selectedId ? [124, 196, 255, 255] : [255, 255, 255, 150]),
      lineWidthMinPixels: 1.5,
      updateTriggers: { getLineColor: triggers },
    }),
    new ScatterplotLayer<Station>({
      id: 'stations',
      data: stations,
      getPosition: (d) => [d.longitude, d.latitude],
      getRadius: (d) => (stateOf(d) !== 'normal' ? 7 : d.lines.length > 1 ? 5 : 3.5),
      radiusUnits: 'pixels',
      getFillColor: (d): RGBA => {
        const state = stateOf(d)
        if (state !== 'normal') return [...STATE_RGB[state], 255]
        return d.lines.length > 1 ? [238, 242, 247, 255] : [10, 13, 19, 255]
      },
      getLineColor: (d): RGBA => (stateOf(d) !== 'normal' ? [5, 7, 11, 255] : [238, 242, 247, 230]),
      lineWidthMinPixels: 1.6,
      stroked: true,
      pickable: true,
      transitions: { getRadius: 250 },
      updateTriggers: { getRadius: triggers, getFillColor: triggers, getLineColor: triggers },
    }),
    new TextLayer<Station>({
      id: 'station-labels',
      data: labeled,
      getPosition: (d) => [d.longitude, d.latitude],
      getText: (d) => d.name,
      getSize: (d) => (d.id === selectedId || stateOf(d) !== 'normal' ? 12 : 10),
      getColor: (d): RGBA => {
        const state = stateOf(d)
        if (state === 'shutdown') return [255, 170, 178, 255]
        if (state === 'maintenance') return [255, 222, 150, 255]
        if (d.id === selectedId) return [190, 225, 255, 255]
        return [180, 189, 202, 210]
      },
      getPixelOffset: [0, -15],
      fontFamily: 'Geist, sans-serif',
      fontWeight: 500,
      fontSettings: { sdf: true },
      outlineWidth: 3,
      outlineColor: [5, 7, 11, 230],
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'bottom',
      updateTriggers: { getSize: triggers, getColor: triggers },
    }),
  ]
}
