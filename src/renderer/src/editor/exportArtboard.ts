import { PDFDocument } from 'pdf-lib'
import type Konva from 'konva'
import type { CanvasSpec, ExportRecord } from '@shared/types'

export type ExportFmt = 'png' | 'jpg' | 'webp' | 'pdf'

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1]
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 60) || 'export'
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
}): Promise<ExportRecord> {
  const { stage, canvas, format, scale, name } = opts
  let bytes: Uint8Array

  if (format === 'pdf') {
    const url = renderToDataUrl(stage, canvas, scale, 'image/png', 1, false)
    const pdf = await PDFDocument.create()
    const img = await pdf.embedPng(dataUrlToBytes(url))
    const page = pdf.addPage([canvas.width, canvas.height])
    page.drawImage(img, { x: 0, y: 0, width: canvas.width, height: canvas.height })
    bytes = await pdf.save()
  } else {
    const mime = format === 'png' ? 'image/png' : format === 'jpg' ? 'image/jpeg' : 'image/webp'
    const transparent = format === 'png' && canvas.background === 'transparent'
    const url = renderToDataUrl(stage, canvas, scale, mime, 0.92, transparent)
    bytes = dataUrlToBytes(url)
  }

  return window.api.exports.save({
    projectId: opts.projectId,
    brandId: opts.brandId,
    format,
    filename: `${sanitize(name)}.${format}`,
    bytes,
    settings: { scale }
  })
}
