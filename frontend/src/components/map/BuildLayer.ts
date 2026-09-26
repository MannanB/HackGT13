import { PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import { dashed } from '@/components/map/dash'
import type { BuildPoint, BuildTarget } from '@/store/buildStore'
import { REMOVE_RGB } from '@/store/buildStore'
import type { Station } from '@/types/network'
import type { RGB } from '@/utils/constants'

interface Pending {
  point: BuildPoint
  label: string
  color: RGB
  isStation: boolean
}

interface Highlight {
  longitude: number
  latitude: number
  label: string
}

const FONT = {
  fontFamily: 'Geist, sans-serif',
  fontWeight: 600,
  fontSettings: { sdf: true },
  outlineWidth: 3,
  outlineColor: [5, 7, 11, 230] as [number, number, number, number],
  getTextAnchor: 'middle' as const,
  getAlignmentBaseline: 'bottom' as const,
}

/** Preview of a stop/destination being placed, its planned links, and the node picked for removal. */
export function createBuildLayers({
  pending,
  neighborStations,
  lineColor,
  target,
}: {
  pending: Pending | null
  neighborStations: Station[]
  lineColor: RGB
  target: BuildTarget | null
}) {
  const previewPaths =
    pending && pending.isStation
      ? neighborStations.map((station) => ({
          path: [
            [pending.point.longitude, pending.point.latitude],
            [station.longitude, station.latitude],
          ] as [number, number][],
        }))
      : []
  const highlight: Highlight[] = target
    ? [
        target.type === 'station'
          ? { longitude: target.station.longitude, latitude: target.station.latitude, label: target.station.name }
          : { longitude: target.poi.longitude, latitude: target.poi.latitude, label: target.poi.name },
      ]
    : []
  const pendingData = pending ? [pending] : []

  return [
    new PathLayer<{ path: [number, number][] }>({
      id: 'build-preview-edges',
      data: previewPaths,
      getPath: (d) => d.path,
      getColor: [...lineColor, 220],
      getWidth: 3,
      widthUnits: 'pixels',
      capRounded: true,
      ...dashed([6, 5]),
    }),
    new ScatterplotLayer<Station>({
      id: 'build-neighbors',
      data: pending?.isStation ? neighborStations : [],
      getPosition: (d) => [d.longitude, d.latitude],
      getRadius: 12,
      radiusUnits: 'pixels',
      filled: false,
      stroked: true,
      getLineColor: [...lineColor, 255],
      lineWidthMinPixels: 2,
    }),
    new ScatterplotLayer<Highlight>({
      id: 'build-target-halo',
      data: highlight,
      getPosition: (d) => [d.longitude, d.latitude],
      getRadius: 20,
      radiusUnits: 'pixels',
      getFillColor: [...REMOVE_RGB, 40],
      stroked: true,
      getLineColor: [...REMOVE_RGB, 200],
      lineWidthMinPixels: 1.5,
    }),
    new TextLayer<Highlight>({
      id: 'build-target-label',
      data: highlight,
      getPosition: (d) => [d.longitude, d.latitude],
      getText: (d) => d.label,
      getSize: 12,
      getColor: [255, 170, 178, 255],
      getPixelOffset: [0, -24],
      ...FONT,
    }),
    new ScatterplotLayer<Pending>({
      id: 'build-pending-halo',
      data: pendingData,
      getPosition: (d) => [d.point.longitude, d.point.latitude],
      getRadius: 18,
      radiusUnits: 'pixels',
      getFillColor: (d) => [...d.color, 45],
      stroked: true,
      getLineColor: (d) => [...d.color, 160],
      lineWidthMinPixels: 1,
      updateTriggers: { getFillColor: pending?.color, getLineColor: pending?.color },
    }),
    new ScatterplotLayer<Pending>({
      id: 'build-pending',
      data: pendingData,
      getPosition: (d) => [d.point.longitude, d.point.latitude],
      getRadius: (d) => (d.isStation ? 7 : 5.5),
      radiusUnits: 'pixels',
      getFillColor: (d) => (d.isStation ? [238, 242, 247, 255] : [...d.color, 255]),
      stroked: true,
      getLineColor: (d) => (d.isStation ? [...d.color, 255] : [5, 7, 11, 255]),
      lineWidthMinPixels: 2,
      updateTriggers: {
        getRadius: pending?.isStation,
        getFillColor: [pending?.isStation, pending?.color],
        getLineColor: [pending?.isStation, pending?.color],
      },
    }),
    new TextLayer<Pending>({
      id: 'build-pending-label',
      data: pendingData,
      getPosition: (d) => [d.point.longitude, d.point.latitude],
      getText: (d) => d.label,
      getSize: 12,
      getColor: [238, 242, 247, 255],
      getPixelOffset: [0, -22],
      ...FONT,
      updateTriggers: { getText: pending?.label },
    }),
  ]
}
