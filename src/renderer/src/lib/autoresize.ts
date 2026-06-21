import { v4 as uuid } from 'uuid'
import type { CanvasSpec, Layer } from '@shared/types'

/**
 * Reposition/scale a design's layers to fit a new canvas. The whole artboard is
 * scaled by a single fit factor and centred — preserving relative layout without
 * overlaps. Crop (source-pixel space) is left untouched.
 */
export function resizeLayers(layers: Layer[], from: CanvasSpec, to: CanvasSpec): Layer[] {
  const scale = Math.min(to.width / from.width, to.height / from.height)
  const offX = (to.width - from.width * scale) / 2
  const offY = (to.height - from.height * scale) / 2
  const sc = (v: number | undefined): number | undefined => (v == null ? undefined : v * scale)

  return layers.map((l) => ({
    ...structuredClone(l),
    id: uuid(),
    x: l.x * scale + offX,
    y: l.y * scale + offY,
    width: l.width * scale,
    height: l.height * scale,
    fontSize: sc(l.fontSize),
    strokeWidth: sc(l.strokeWidth),
    cornerRadius: sc(l.cornerRadius),
    pointerLength: sc(l.pointerLength),
    pointerWidth: sc(l.pointerWidth),
    letterSpacing: sc(l.letterSpacing),
    shadowBlur: sc(l.shadowBlur),
    shadowOffsetX: sc(l.shadowOffsetX),
    shadowOffsetY: sc(l.shadowOffsetY),
    points: l.points ? l.points.map((p) => p * scale) : undefined
  }))
}
