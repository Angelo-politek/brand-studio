import type { Layer } from '@shared/types'

export interface KonvaGradientProps {
  fillPriority: 'linear-gradient' | 'radial-gradient'
  fillLinearGradientStartPoint?: { x: number; y: number }
  fillLinearGradientEndPoint?: { x: number; y: number }
  fillRadialGradientStartPoint?: { x: number; y: number }
  fillRadialGradientEndPoint?: { x: number; y: number }
  fillRadialGradientStartRadius?: number
  fillRadialGradientEndRadius?: number
  fillLinearGradientColorStops?: (number | string)[]
  fillRadialGradientColorStops?: (number | string)[]
}

/**
 * Map a layer's two-stop gradient onto Konva fill-gradient props, in local
 * (0..w, 0..h) coordinates. Pure so both the live node and the export path
 * produce identical fills. Returns null when the layer has no gradient.
 */
export function gradientToKonvaProps(
  gradient: NonNullable<Layer['gradient']> | null | undefined,
  w: number,
  h: number
): KonvaGradientProps | null {
  if (!gradient) return null
  const stops = [0, gradient.from, 1, gradient.to]

  if (gradient.type === 'radial') {
    const cx = w / 2
    const cy = h / 2
    return {
      fillPriority: 'radial-gradient',
      fillRadialGradientStartPoint: { x: cx, y: cy },
      fillRadialGradientEndPoint: { x: cx, y: cy },
      fillRadialGradientStartRadius: 0,
      fillRadialGradientEndRadius: Math.max(w, h) / 2,
      fillRadialGradientColorStops: stops
    }
  }

  // Linear: project the angle onto the box, centered, spanning corner to corner.
  const rad = ((gradient.angle ?? 0) * Math.PI) / 180
  const dx = Math.cos(rad)
  const dy = Math.sin(rad)
  const cx = w / 2
  const cy = h / 2
  const half = (Math.abs(dx) * w + Math.abs(dy) * h) / 2
  return {
    fillPriority: 'linear-gradient',
    fillLinearGradientStartPoint: { x: cx - dx * half, y: cy - dy * half },
    fillLinearGradientEndPoint: { x: cx + dx * half, y: cy + dy * half },
    fillLinearGradientColorStops: stops
  }
}

/**
 * Shift all gradient points by (dx, dy). Used for nodes whose origin is the
 * center (Ellipse, RegularPolygon) rather than the top-left corner.
 */
export function offsetGradient(
  props: KonvaGradientProps,
  dx: number,
  dy: number
): KonvaGradientProps {
  const shift = (p?: { x: number; y: number }): { x: number; y: number } | undefined =>
    p ? { x: p.x + dx, y: p.y + dy } : undefined
  return {
    ...props,
    fillLinearGradientStartPoint: shift(props.fillLinearGradientStartPoint),
    fillLinearGradientEndPoint: shift(props.fillLinearGradientEndPoint),
    fillRadialGradientStartPoint: shift(props.fillRadialGradientStartPoint),
    fillRadialGradientEndPoint: shift(props.fillRadialGradientEndPoint)
  }
}
