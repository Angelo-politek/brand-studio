import Konva from 'konva'
import type { Filter } from 'konva/lib/Node'
import { mediaUrl } from '@shared/ipc'
import { animateLayer } from './videoAnim'
import { buildPanelPrimitives } from './panelShapes'
import { dataUrlToBytes } from './bytes'
import { Temperature } from './konvaFilters'
import { gradientToKonvaProps, offsetGradient } from './gradients'
import { iconToImage } from './icons'
import type { Layer, VideoScene } from '@shared/types'

/** Shadow props shared by every shape/text/image node in the export path. */
function shadowProps(layer: Layer): Record<string, unknown> {
  return {
    shadowColor: layer.shadowColor,
    shadowBlur: layer.shadowBlur ?? 0,
    shadowOffsetX: layer.shadowOffsetX ?? 0,
    shadowOffsetY: layer.shadowOffsetY ?? 0
  }
}

function blendProp(layer: Layer): Record<string, unknown> {
  return layer.blendMode && layer.blendMode !== 'normal'
    ? { globalCompositeOperation: layer.blendMode }
    : {}
}

/** Corner/top-left gradient fill props, or { fill } when there is no gradient. */
function fillFor(layer: Layer, centered = false): Record<string, unknown> {
  const g = gradientToKonvaProps(layer.gradient, layer.width, layer.height)
  if (!g) return { fill: layer.fill }
  return { ...(centered ? offsetGradient(g, -layer.width / 2, -layer.height / 2) : g) }
}

/** Load an image element (CORS-safe) for export rendering. */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

/** Public alias for the design page thumbnail renderer (see lib/pageThumbnail.ts). */
export function addLayerNodeForThumbnail(konvaLayer: Konva.Layer, layer: Layer): Promise<void> {
  return addLayerNode(konvaLayer, layer)
}

/** Add a single design Layer to a Konva layer imperatively (export only). */
async function addLayerNode(
  konvaLayer: Konva.Layer,
  layer: Layer,
  imageCache?: Map<string, HTMLImageElement>
): Promise<void> {
  if (!layer.visible) return
  const common = {
    x: layer.x,
    y: layer.y,
    rotation: layer.rotation,
    scaleX: layer.scaleX,
    scaleY: layer.scaleY,
    opacity: layer.opacity,
    ...blendProp(layer)
  }

  switch (layer.type) {
    case 'text':
      konvaLayer.add(
        new Konva.Text({
          ...common,
          ...shadowProps(layer),
          text: layer.text ?? '',
          width: layer.width,
          fontFamily: layer.fontFamily ?? 'Inter',
          fontSize: layer.fontSize ?? 48,
          fontStyle: layer.fontStyle ?? 'normal',
          fill: layer.fill ?? '#ffffff',
          align: layer.align ?? 'left',
          letterSpacing: layer.letterSpacing ?? 0,
          lineHeight: layer.lineHeight ?? 1.2,
          ...(layer.gradient ? fillFor(layer) : { fill: layer.fill ?? '#ffffff' }),
          stroke: layer.strokeWidth ? layer.strokeColor : undefined,
          strokeWidth: layer.strokeWidth ?? 0
        })
      )
      break
    case 'rect':
      konvaLayer.add(
        new Konva.Rect({
          ...common,
          ...shadowProps(layer),
          width: layer.width,
          height: layer.height,
          ...fillFor(layer),
          cornerRadius: layer.cornerRadius ?? 0,
          stroke: layer.strokeWidth ? layer.strokeColor : undefined,
          strokeWidth: layer.strokeWidth ?? 0
        })
      )
      break
    case 'circle':
      konvaLayer.add(
        new Konva.Ellipse({
          ...common,
          ...shadowProps(layer),
          x: layer.x + layer.width / 2,
          y: layer.y + layer.height / 2,
          radiusX: layer.width / 2,
          radiusY: layer.height / 2,
          ...fillFor(layer, true),
          stroke: layer.strokeWidth ? layer.strokeColor : undefined,
          strokeWidth: layer.strokeWidth ?? 0
        })
      )
      break
    case 'triangle':
    case 'polygon': {
      const r = 50
      konvaLayer.add(
        new Konva.RegularPolygon({
          ...common,
          ...shadowProps(layer),
          x: layer.x + layer.width / 2,
          y: layer.y + layer.height / 2,
          sides: layer.type === 'triangle' ? 3 : (layer.sides ?? 6),
          radius: r,
          scaleX: (layer.scaleX || 1) * (layer.width / (2 * r)),
          scaleY: (layer.scaleY || 1) * (layer.height / (2 * r)),
          ...fillFor(layer, true),
          stroke: layer.strokeWidth ? layer.strokeColor : undefined,
          strokeWidth: layer.strokeWidth ?? 0,
          strokeScaleEnabled: false
        })
      )
      break
    }
    case 'line':
      konvaLayer.add(
        new Konva.Line({
          ...common,
          points: [0, layer.height / 2, layer.width, layer.height / 2],
          stroke: layer.strokeColor ?? '#ffffff',
          strokeWidth: layer.strokeWidth ?? 6,
          lineCap: 'round'
        })
      )
      break
    case 'arrow':
      konvaLayer.add(
        new Konva.Arrow({
          ...common,
          points: [0, layer.height / 2, layer.width, layer.height / 2],
          stroke: layer.strokeColor ?? '#ffffff',
          fill: layer.strokeColor ?? '#ffffff',
          strokeWidth: layer.strokeWidth ?? 6,
          pointerLength: layer.pointerLength ?? 20,
          pointerWidth: layer.pointerWidth ?? 20
        })
      )
      break
    case 'image': {
      if (!layer.src) break
      const url = mediaUrl(layer.src)
      let img = imageCache?.get(url)
      if (!img) {
        img = await loadImage(url)
        imageCache?.set(url, img)
      }
      const f = layer.filters ?? {}
      const filters: Filter[] = []
      if (f.brightness) filters.push(Konva.Filters.Brighten)
      if (f.contrast) filters.push(Konva.Filters.Contrast)
      if (f.blur) filters.push(Konva.Filters.Blur)
      if (f.grayscale) filters.push(Konva.Filters.Grayscale)
      if (f.saturation || f.hue) filters.push(Konva.Filters.HSL)
      if (f.temperature) filters.push(Temperature)

      const imgNode = new Konva.Image({
        ...common,
        ...shadowProps(layer),
        image: img,
        width: layer.width,
        height: layer.height,
        crop: layer.crop ?? undefined,
        filters,
        brightness: f.brightness ?? 0,
        contrast: f.contrast ?? 0,
        blurRadius: f.blur ?? 0,
        saturation: f.saturation ?? 0,
        hue: f.hue ?? 0,
        temperature: f.temperature ?? 0
      })
      if (filters.length > 0) imgNode.cache()

      const co = layer.colorOverlay
      if (co && co.opacity > 0) {
        // Wrap image + tint overlay in a Group so the tint composites over it.
        const group = new Konva.Group(common)
        imgNode.setAttrs({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1 })
        group.add(imgNode)
        group.add(
          new Konva.Rect({
            width: layer.width,
            height: layer.height,
            fill: co.hex,
            opacity: co.opacity,
            globalCompositeOperation:
              co.blendMode === 'color' ? 'color' : (co.blendMode as GlobalCompositeOperation)
          })
        )
        konvaLayer.add(group)
      } else {
        konvaLayer.add(imgNode)
      }
      break
    }
    case 'icon': {
      if (!layer.icon) break
      const iconImg = await iconToImage(layer.icon.id, layer.fill ?? null)
      if (!iconImg) break
      konvaLayer.add(
        new Konva.Image({ ...common, image: iconImg, width: layer.width, height: layer.height })
      )
      break
    }
    case 'panelComponent': {
      if (!layer.component) break
      // Same primitives as the live editor node (lib/panelShapes.ts).
      const group = new Konva.Group(common)
      const prims = buildPanelPrimitives(
        layer.component.kind,
        layer.component.params ?? {},
        layer.width,
        layer.height
      )
      for (const p of prims) {
        switch (p.kind) {
          case 'circle':
            group.add(
              new Konva.Circle({
                x: p.x,
                y: p.y,
                radius: p.radius,
                fill: p.fill,
                stroke: p.stroke,
                strokeWidth: p.strokeWidth,
                shadowColor: p.shadowColor,
                shadowBlur: p.shadowBlur,
                opacity: p.opacity ?? 1
              })
            )
            break
          case 'rect':
            group.add(
              new Konva.Rect({
                x: p.x,
                y: p.y,
                width: p.width,
                height: p.height,
                cornerRadius: p.cornerRadius,
                fill: p.fill,
                stroke: p.stroke,
                strokeWidth: p.strokeWidth,
                opacity: p.opacity ?? 1
              })
            )
            break
          case 'line':
            group.add(
              new Konva.Line({
                points: p.points,
                stroke: p.stroke,
                strokeWidth: p.strokeWidth,
                lineCap: p.lineCap,
                opacity: p.opacity ?? 1
              })
            )
            break
          case 'polygon':
            group.add(
              new Konva.RegularPolygon({
                x: p.x,
                y: p.y,
                radius: p.radius,
                sides: p.sides,
                rotation: p.rotation ?? 0,
                fill: p.fill,
                stroke: p.stroke,
                strokeWidth: p.strokeWidth
              })
            )
            break
          case 'text':
            group.add(
              new Konva.Text({
                x: p.x,
                y: p.y,
                width: p.width,
                text: p.text,
                fontSize: p.fontSize,
                fontFamily: p.fontFamily,
                fill: p.fill,
                align: p.align,
                opacity: p.opacity ?? 1
              })
            )
            break
        }
      }
      konvaLayer.add(group)
      break
    }
    default:
      // triangle / polygon / line / arrow: approximate with a rect-less skip
      // (rarely used as video overlays; can be extended later).
      break
  }
}

/**
 * Render a scene's overlay layers to a transparent PNG at native resolution.
 * Returns null when the scene has no visible overlays.
 */
export async function renderSceneOverlayPng(
  scene: VideoScene,
  width: number,
  height: number
): Promise<Uint8Array | null> {
  const visible = scene.layers.filter((l) => l.visible)
  if (visible.length === 0) return null

  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '-99999px'
  document.body.appendChild(container)

  const stage = new Konva.Stage({ container, width, height })
  const layer = new Konva.Layer()
  stage.add(layer)

  try {
    for (const l of visible) await addLayerNode(layer, l)
    layer.draw()
    // Decode directly: fetch(dataUrl) is blocked by the CSP connect-src.
    return dataUrlToBytes(stage.toDataURL({ pixelRatio: 1, mimeType: 'image/png' }))
  } finally {
    stage.destroy()
    container.remove()
  }
}

/** True if any visible layer in the scene has an enter/exit animation. */
export function sceneHasAnimation(scene: VideoScene): boolean {
  return scene.layers.some(
    (l) =>
      l.visible &&
      l.anim &&
      ((l.anim.in && l.anim.in !== 'none') || (l.anim.out && l.anim.out !== 'none'))
  )
}

/**
 * Render a scene's overlays as an animated PNG frame sequence at `fps`,
 * applying enter/exit animations across the scene duration. Use only when
 * `sceneHasAnimation` is true (heavier than a single PNG).
 *
 * With `onFrame`, each frame is handed off as soon as it is rasterized (e.g.
 * written to disk) and the returned array stays empty — this keeps memory flat
 * regardless of scene length. Without it, all frames are returned in memory.
 */
export async function renderSceneOverlayFrames(
  scene: VideoScene,
  width: number,
  height: number,
  fps: number,
  onFrame?: (bytes: Uint8Array, index: number) => Promise<void>
): Promise<Uint8Array[]> {
  const visible = scene.layers.filter((l) => l.visible)
  if (visible.length === 0) return []

  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '-99999px'
  document.body.appendChild(container)

  // One stage reused across every frame: creating a Stage per frame both
  // thrashes the GC and re-decodes each image layer on every frame.
  const stage = new Konva.Stage({ container, width, height })
  const layer = new Konva.Layer()
  stage.add(layer)
  const imageCache = new Map<string, HTMLImageElement>()

  const frames: Uint8Array[] = []
  try {
    const frameCount = Math.max(1, Math.round((scene.durationMs / 1000) * fps))
    for (let i = 0; i < frameCount; i++) {
      const tMs = (i / fps) * 1000
      layer.destroyChildren()
      for (const l of visible) {
        await addLayerNode(layer, animateLayer(l, tMs, scene.durationMs), imageCache)
      }
      layer.draw()
      // Decode directly: fetch(dataUrl) is blocked by the CSP connect-src.
      const bytes = dataUrlToBytes(stage.toDataURL({ pixelRatio: 1, mimeType: 'image/png' }))
      if (onFrame) await onFrame(bytes, i)
      else frames.push(bytes)
    }
    return frames
  } finally {
    stage.destroy()
    container.remove()
  }
}
