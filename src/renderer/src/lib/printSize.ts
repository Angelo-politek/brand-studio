/**
 * Physical-size math for PDF export.
 *
 * PDF measures pages in POINTS (1pt = 1/72"), never in pixels. Our canvases are
 * in pixels, and the print presets are authored at a known pixel density, so a
 * PDF page is only correct once we convert px -> pt through that density:
 *
 *     pt = px / dpi * 72
 *
 * Getting this wrong is not a subtle visual bug: passing raw pixels as points
 * turns an A4 (2480x3508 px) into an 87x124 cm page.
 *
 * This module is intentionally pure (no DOM, no Konva, no pdf-lib) so the
 * conversion can be unit-tested in a plain node environment.
 */

import { SIZE_PRESETS } from './presets'

/** PostScript points per inch. Fixed by the PDF spec. */
export const POINTS_PER_INCH = 72

/** Millimetres per inch. */
export const MM_PER_INCH = 25.4

/**
 * Screen-native density. A canvas that isn't a print format is a screen design,
 * so 1 canvas px == 1 CSS px == 1 pt at 72 DPI.
 */
export const SCREEN_DPI = 72

/** Density of the Print presets, authored at 300 DPI. */
export const PRINT_DPI = 300

/**
 * Density of the Hardware presets, authored at 10 px per mm
 * (10 px/mm * 25.4 mm/in = 254 DPI), so panel mockups print 1:1.
 */
export const HARDWARE_DPI = 254

/** DPI choices offered in the export UI. */
export const DPI_CHOICES = [72, 150, 254, 300] as const

/**
 * Maximum pixels per side a browser canvas can rasterize. Above this, Chromium
 * silently yields a BLANK canvas with no thrown error, which would produce an
 * empty PDF. Kept a little under the common 16384 hard limit for safety.
 */
export const MAX_CANVAS_PX = 16384

/**
 * Which pixel density a canvas of this exact size was authored at.
 *
 * Derived from the preset table rather than read off a stored field: the preset
 * dimensions already encode the density unambiguously (2480x3508 is only A4 at
 * 300 DPI), which means every project already saved on disk resolves correctly
 * with no migration and no schema change.
 *
 * Orientation-insensitive, so a rotated/landscape A4 still resolves to 300.
 * Anything not matching a print-like preset is treated as a screen design.
 */
export function inferDpi(width: number, height: number): number {
  const matches = (pw: number, ph: number): boolean =>
    (width === pw && height === ph) || (width === ph && height === pw)

  for (const p of SIZE_PRESETS) {
    if (!matches(p.width, p.height)) continue
    if (p.category === 'Print') return PRINT_DPI
    if (p.category === 'Hardware') return HARDWARE_DPI
    // Marketing holds both screen banners and the print-sized Product Sheet;
    // fall through so a later Print entry of the same size can still win.
  }
  // Product Sheet shares A4's pixel size, so an exact A4 match implies print.
  for (const p of SIZE_PRESETS) {
    if (p.category === 'Print' && matches(p.width, p.height)) return PRINT_DPI
  }
  return SCREEN_DPI
}

/** Convert a pixel length at `dpi` into PDF points. */
export function pxToPt(px: number, dpi: number): number {
  return (px / dpi) * POINTS_PER_INCH
}

/** Convert a pixel length at `dpi` into millimetres. */
export function pxToMm(px: number, dpi: number): number {
  return (px / dpi) * MM_PER_INCH
}

export interface PhysicalSize {
  /** PDF page size in points. */
  widthPt: number
  heightPt: number
  /** Human-facing physical size in millimetres. */
  widthMm: number
  heightMm: number
  dpi: number
}

/**
 * Full physical description of a pixel canvas at a given density.
 * `dpi` falls back to the inferred density when not explicitly chosen.
 */
export function physicalSize(width: number, height: number, dpi?: number): PhysicalSize {
  const effective = dpi && dpi > 0 ? dpi : inferDpi(width, height)
  return {
    widthPt: pxToPt(width, effective),
    heightPt: pxToPt(height, effective),
    widthMm: pxToMm(width, effective),
    heightMm: pxToMm(height, effective),
    dpi: effective
  }
}

/** Round to at most `digits` decimals, dropping trailing zeros. */
function trim(n: number, digits: number): string {
  return String(Number(n.toFixed(digits)))
}

/**
 * Short human label for the export dialog, e.g. "210 × 297 mm @ 300 DPI".
 * Screen-density canvases are additionally shown in inches, because "381 × 381
 * mm" is a meaningless way to describe a 1080x1080 social post.
 */
export function formatPhysicalSize(width: number, height: number, dpi?: number): string {
  const s = physicalSize(width, height, dpi)
  const mm = `${trim(s.widthMm, 1)} × ${trim(s.heightMm, 1)} mm`
  if (s.dpi === SCREEN_DPI) {
    const inW = trim(s.widthPt / POINTS_PER_INCH, 2)
    const inH = trim(s.heightPt / POINTS_PER_INCH, 2)
    return `${mm} (${inW} × ${inH} in) @ ${s.dpi} DPI`
  }
  return `${mm} @ ${s.dpi} DPI`
}

/**
 * Largest whole-ish scale factor that keeps a raster capture inside the browser
 * canvas limit. Returns `scale` untouched when it already fits.
 */
export function clampScaleToCanvasLimit(
  width: number,
  height: number,
  scale: number,
  maxPx = MAX_CANVAS_PX
): number {
  const longest = Math.max(width, height)
  if (longest <= 0) return scale
  const max = maxPx / longest
  if (scale <= max) return scale
  return Math.max(1, Math.floor(max * 100) / 100)
}

/**
 * Whether rasterizing at this scale would exceed the canvas limit and silently
 * produce a blank image.
 */
export function exceedsCanvasLimit(
  width: number,
  height: number,
  scale: number,
  maxPx = MAX_CANVAS_PX
): boolean {
  return Math.max(width * scale, height * scale) > maxPx
}
