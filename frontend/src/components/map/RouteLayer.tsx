import { PathStyleExtension } from '@deck.gl/extensions'
import { PathLayer } from '@deck.gl/layers'
import { pathCoordinates } from '@/utils/geo'
import type { RoutePath } from '@/types/simulation'

export function createRouteLayers(normal?: RoutePath | null, disrupted?: RoutePath | null) {
  const layers = []

  if (normal) {
    layers.push(
      new PathLayer({
        id: 'route-normal',
        data: [{ path: pathCoordinates(normal.nodes) }],
        getPath: (d: { path: [number, number][] }) => d.path,
        getColor: [183, 195, 211, 190],
        getWidth: 2.5,
        widthUnits: 'pixels',
        capRounded: true,
        jointRounded: true,
        getDashArray: [5, 4],
        dashJustified: true,
        extensions: [new PathStyleExtension({ dash: true })],
      }),
    )
  }

  if (disrupted) {
    layers.push(
      new PathLayer({
        id: 'route-disrupted',
        data: [{ path: pathCoordinates(disrupted.nodes) }],
        getPath: (d: { path: [number, number][] }) => d.path,
        getColor: [59, 130, 246, 230],
        getWidth: 4,
        widthUnits: 'pixels',
        capRounded: true,
        jointRounded: true,
      }),
    )
  }

  return layers
}
