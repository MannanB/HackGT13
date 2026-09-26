import { PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import { dashed } from '@/components/map/dash'
import type { BuildPoint } from '@/store/buildStore'
import type { Station } from '@/types/network'
import type { RGB } from '@/utils/constants'

interface Pending {
  point: BuildPoint
  label: string
  color: RGB
  isStation: boolean
}

/** Planned links and the in-progress marker. Selection uses the shared blue station/POI focus ring. */
export const BUILD_PENDING_LAYER = 'build-pending'

export function createBuildLayers({
  pending,
  neighborStations,
  lineColor,
  dragging = false,
}: {
  pending: Pending | null
  neighborStations: Station[]
  lineColor: RGB
  dragging?: boolean
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
  const pendingData = pending ? [pending] : []

  return [
    new PathLayer<{ path: [number, number][] }>({
      id: 'build-preview-edges',
      data: previewPaths,
      getPath: (d) => d.path,
      getColor: [...lineColor, 200],
      getWidth: 2.5,
      widthUnits: 'pixels',
      capRounded: true,
      ...dashed([6, 5]),
    }),
    new ScatterplotLayer<Pending>({
      id: BUILD_PENDING_LAYER,
      data: pendingData,
      getPosition: (d) => [d.point.longitude, d.point.latitude],
      getRadius: dragging ? 8 : 6,
      radiusUnits: 'pixels',
      getFillColor: [255, 255, 255, 255],
      pickable: true,
      updateTriggers: { getRadius: dragging },
    }),
    new TextLayer<Pending>({
      id: 'build-pending-label',
      data: pendingData,
      getPosition: (d) => [d.point.longitude, d.point.latitude],
      getText: (d) => d.label,
      getSize: 12,
      getColor: [238, 242, 247, 255],
      getPixelOffset: [0, 18],
      fontFamily: 'Inter, sans-serif',
      fontWeight: 600,
      fontSettings: { sdf: true },
      outlineWidth: 3,
      outlineColor: [5, 7, 11, 230],
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'top',
      updateTriggers: { getText: pending?.label },
    }),
  ]
}
