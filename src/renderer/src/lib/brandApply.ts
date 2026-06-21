import type { Brand, Layer } from '@shared/types'

/**
 * Apply a brand's colors and fonts to a set of layers. Pure function (no store
 * access) so it is easy to test and reuse.
 *
 * - Text layers get the brand heading font and primary color.
 * - Shape layers get the brand primary color as fill.
 * Layers without a relevant property are returned unchanged.
 */
export function applyBrandToLayers(layers: Layer[], brand: Brand): Layer[] {
  const primary = brand.colors[0]?.hex
  const heading = brand.fonts.find((f) => f.role === 'heading')?.family
  const body = brand.fonts.find((f) => f.role === 'body')?.family

  return layers.map((l) => {
    if (l.type === 'text') {
      return {
        ...l,
        ...(primary ? { fill: primary } : {}),
        ...(heading ? { fontFamily: heading } : {})
      }
    }
    if (['rect', 'circle', 'triangle', 'polygon'].includes(l.type)) {
      return primary ? { ...l, fill: primary } : l
    }
    // Lines/arrows use stroke color.
    if (['line', 'arrow'].includes(l.type)) {
      return primary ? { ...l, strokeColor: primary } : l
    }
    // Mark body font as used (kept for future per-role assignment).
    void body
    return l
  })
}
