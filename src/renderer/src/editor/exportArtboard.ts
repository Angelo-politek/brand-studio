import { PDFDocument } from 'pdf-lib'
import type Konva from 'konva'
import { dataUrlToBytes } from '@renderer/lib/bytes'
import { exceedsCanvasLimit, physicalSize } from '@renderer/lib/printSize'
import type { CanvasSpec, ExportRecord } from '@shared/types'

export type ExportFmt = 'png' | 'jpg' | 'webp' | 'pdf'

export function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 60) || 'export'
}

const mimeFor = (format: ExportFmt): string =>
  format === 'png' ? 'image/png' : format === 'jpg' ? 'image/jpeg' : 'image/webp'

/** Render the current artboard to raster/PDF bytes (no persistence). */
export async function artboardBytes(
  stage: Konva.Stage,
  canvas: CanvasSpec,
  format: ExportFmt,
  scale: number,
  quality = 0.92,
  dpi?: number
): Promise<Uint8Array> {
  assertRasterizable(canvas.width, canvas.height, scale)
  // Konva draws text onto a canvas, which — unlike DOM text — does not trigger
  // a lazy @font-face load. Exporting before the bundled/brand faces resolve
  // would silently rasterize a fallback font, so the file would not match what
  // the user sees on screen. Cheap once loaded: it resolves immediately.
  await document.fonts.ready
  if (format === 'pdf') {
    const url = renderToDataUrl(stage, canvas, scale, 'image/png', 1, false)
    return pagesToPdf([
      { bytes: dataUrlToBytes(url), width: canvas.width, height: canvas.height, dpi }
    ])
  }
  const transparent = format === 'png' && canvas.background === 'transparent'
  const url = renderToDataUrl(stage, canvas, scale, mimeFor(format), quality, transparent)
  return dataUrlToBytes(url)
}

/** One captured page: its PNG bytes plus the pixel size it was authored at. */
export interface PdfPageInput {
  bytes: Uint8Array
  /** Canvas size in pixels (NOT the raster size, which may be scaled up). */
  width: number
  height: number
  /** Pixel density of the canvas. Inferred from its size when omitted. */
  dpi?: number
}

/**
 * Build a single multi-page PDF from already-captured page PNGs.
 *
 * Each page is sized in POINTS derived from its own pixel size and density, so
 * a 2480x3508 px A4 becomes a 595.3 x 841.9 pt page (exactly 210x297 mm) and
 * pages of differing sizes each keep their correct physical dimensions. The
 * embedded raster is stretched to fill that page, so a higher-resolution
 * capture raises print quality without changing the physical size.
 */
export async function pagesToPdf(pages: PdfPageInput[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  for (const p of pages) {
    const { widthPt, heightPt } = physicalSize(p.width, p.height, p.dpi)
    const img = await pdf.embedPng(p.bytes)
    const page = pdf.addPage([widthPt, heightPt])
    page.drawImage(img, { x: 0, y: 0, width: widthPt, height: heightPt })
  }
  return pdf.save()
}

/**
 * Guard against the browser canvas size limit. Chromium returns a BLANK canvas
 * with no error above ~16384 px per side, which would yield a silently empty
 * export -- worse than a visible failure. Fail loudly instead.
 */
export function assertRasterizable(width: number, height: number, scale: number): void {
  if (!exceedsCanvasLimit(width, height, scale)) return
  const w = Math.round(width * scale)
  const h = Math.round(height * scale)
  throw new Error(
    `This export would rasterize to ${w}x${h}px, beyond the browser canvas limit ` +
      `(16384px per side) and would come out blank. Lower the scale and try again.`
  )
}

/** Save bytes to a user-chosen location via the save dialog. Returns true if saved. */
export async function saveBytesAs(
  bytes: Uint8Array,
  suggestedName: string,
  format: ExportFmt
): Promise<boolean> {
  const target = await window.api.app.saveFileDialog({
    defaultPath: `${sanitize(suggestedName)}.${format}`,
    filters: [{ name: format.toUpperCase(), extensions: [format] }]
  })
  if (!target) return false
  await window.api.app.writeFileTo(target, bytes)
  return true
}

/**
 * Capture the artboard region at native resolution, independent of the current
 * zoom/pan. Temporarily resets the stage transform (synchronously, no repaint)
 * so design coords map 1:1 to capture coords.
 */
function renderToDataUrl(
  stage: Konva.Stage,
  canvas: CanvasSpec,
  scale: number,
  mimeType: string,
  quality: number,
  transparent: boolean
): string {
  const oldScale = stage.scaleX()
  const oldPos = { x: stage.x(), y: stage.y() }
  const bg = stage.findOne('.artboard-bg') as Konva.Rect | undefined
  const bgVisible = bg?.visible() ?? true

  stage.scale({ x: 1, y: 1 })
  stage.position({ x: 0, y: 0 })
  if (transparent && bg) bg.visible(false)

  const url = stage.toDataURL({
    x: 0,
    y: 0,
    width: canvas.width,
    height: canvas.height,
    pixelRatio: scale,
    mimeType,
    quality
  })

  if (bg) bg.visible(bgVisible)
  stage.scale({ x: oldScale, y: oldScale })
  stage.position(oldPos)
  stage.batchDraw()
  return url
}

/** Capture a small PNG of the artboard for grid thumbnails. */
export function captureThumbnailBytes(
  stage: Konva.Stage,
  canvas: CanvasSpec,
  max = 400
): Uint8Array {
  const scale = Math.min(1, max / Math.max(canvas.width, canvas.height))
  const url = renderToDataUrl(stage, canvas, scale, 'image/png', 1, false)
  return dataUrlToBytes(url)
}

export async function exportArtboard(opts: {
  stage: Konva.Stage
  canvas: CanvasSpec
  format: ExportFmt
  scale: number
  name: string
  projectId: string | null
  brandId: string | null
  quality?: number
  /** PDF only: pixel density used to size the page. Inferred when omitted. */
  dpi?: number
}): Promise<ExportRecord> {
  const { stage, canvas, format, scale, name, quality, dpi } = opts
  const bytes = await artboardBytes(stage, canvas, format, scale, quality, dpi)

  return window.api.exports.save({
    projectId: opts.projectId,
    brandId: opts.brandId,
    format,
    filename: `${sanitize(name)}.${format}`,
    bytes,
    settings: {
      scale,
      ...(quality != null ? { quality } : {}),
      ...(format === 'pdf' ? { dpi: physicalSize(canvas.width, canvas.height, dpi).dpi } : {})
    }
  })
}
