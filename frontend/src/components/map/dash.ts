import { PathStyleExtension } from '@deck.gl/extensions'

const extension = new PathStyleExtension({ dash: true })

/** PathStyleExtension props aren't part of PathLayer's typed props, so they're spread in untyped. */
export function dashed(pattern: [number, number]): object {
  return { getDashArray: pattern, dashJustified: true, extensions: [extension] }
}
