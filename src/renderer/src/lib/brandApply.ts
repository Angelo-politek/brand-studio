import type { Brand, Layer } from '@shared/types'

/**
 * Apply a brand's colors and fonts to a set of layers. Pure function (no store
 * access) so it is easy to test and reuse.
 *
 * Role mapping:
 * - Title text (largest font size) → heading font + primary color.
 * - Other text → body font (when set) + primary color.
 * - Shapes → secondary color when the brand has one, else primary.
 * - Lines/arrows → accent color when present, else primary.
 * Layers without a relevant property are returned unchanged. Colors fall back
 * along accent → secondary → primary so a single-color brand still works.
 */
export function applyBrandToLayers(layers: Layer[], brand: Brand): Layer[] {
  const byRole = (role: string): string | undefined =>
    brand.colors.find((c) => c.role === role)?.hex
  const primary = byRole('primary') ?? brand.colors[0]?.hex
  const secondary = byRole('secondary') ?? primary
  const accent = byRole('accent') ?? secondary
  const heading = brand.fonts.find((f) => f.role === 'heading')?.family
  const body = brand.fonts.find((f) => f.role === 'body')?.family

  // The largest visible font on the page is treated as the title.
  const maxFont = layers.reduce((m, l) => (l.type === 'text' ? Math.max(m, l.fontSize ?? 0) : m), 0)

  return layers.map((l) => {
    if (l.type === 'text') {
      const isTitle = (l.fontSize ?? 0) === maxFont && maxFont > 0
      const font = isTitle ? heading : (body ?? heading)
      return {
        ...l,
        ...(primary ? { fill: primary } : {}),
        ...(font ? { fontFamily: font } : {})
      }
    }
    if (['rect', 'circle', 'triangle', 'polygon'].includes(l.type)) {
      return secondary ? { ...l, fill: secondary } : l
    }
    // Outline icons follow the primary color; brand LOGOS (no fill → keep their
    // official colors) are left untouched.
    if (l.type === 'icon') {
      return primary && l.fill ? { ...l, fill: primary } : l
    }
    // Lines/arrows use stroke color.
    if (['line', 'arrow'].includes(l.type)) {
      return accent ? { ...l, strokeColor: accent } : l
    }
    return l
  })
}
