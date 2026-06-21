import Konva from 'konva'
import { mediaUrl } from '@shared/ipc'
import { animateLayer } from './videoAnim'
import type { Layer, VideoScene } from '@shared/types'

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

/** Add a single design Layer to a Konva layer imperatively (export only). */
async function addLayerNode(konvaLayer: Konva.Layer, layer: Layer): Promise<void> {
  if (!layer.visible) return
  const common = {
    x: layer.x,
    y: layer.y,
    rotation: layer.rotation,
    scaleX: layer.scaleX,
    scaleY: layer.scaleY,
    opacity: layer.opacity
  }

  switch (layer.type) {
    case 'text':
      konvaLayer.add(
        new Konva.Text({
          ...common,
          text: layer.text ?? '',
          width: layer.width,
          fontFamily: layer.fontFamily ?? 'Inter',
          fontSize: layer.fontSize ?? 48,
          fontStyle: layer.fontStyle ?? 'normal',
          fill: layer.fill ?? '#ffffff',
          align: layer.align ?? 'left',
          letterSpacing: layer.letterSpacing ?? 0,
          lineHeight: layer.lineHeight ?? 1.2,
          stroke: layer.strokeWidth ? layer.strokeColor : undefined,
          strokeWidth: layer.strokeWidth ?? 0
        })
      )
      break
    case 'rect':
      konvaLayer.add(
        new Konva.Rect({
          ...common,
          width: layer.width,
          height: layer.height,
          fill: layer.fill,
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
          x: layer.x + layer.width / 2,
          y: layer.y + layer.height / 2,
          radiusX: layer.width / 2,
          radiusY: layer.height / 2,
          fill: layer.fill
        })
      )
      break
    case 'image': {
      if (!layer.src) break
      const img = await loadImage(mediaUrl(layer.src))
      konvaLayer.add(
        new Konva.Image({
          ...common,
          image: img,
          width: layer.width,
          height: layer.height,
          crop: layer.crop ?? undefined
        })
      )
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
    const dataUrl = stage.toDataURL({ pixelRatio: 1, mimeType: 'image/png' })
    const res = await fetch(dataUrl)
    return new Uint8Array(await res.arrayBuffer())
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
 * applying enter/exit animations across the scene duration. Returns one PNG per
 * frame. Use only when `sceneHasAnimation` is true (heavier than a single PNG).
 */
export async function renderSceneOverlayFrames(
  scene: VideoScene,
  width: number,
  height: number,
  fps: number
): Promise<Uint8Array[]> {
  const visible = scene.layers.filter((l) => l.visible)
  if (visible.length === 0) return []

  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '-99999px'
  document.body.appendChild(container)

  const frames: Uint8Array[] = []
  try {
    const frameCount = Math.max(1, Math.round((scene.durationMs / 1000) * fps))
    for (let i = 0; i < frameCount; i++) {
      const tMs = (i / fps) * 1000
      const stage = new Konva.Stage({ container, width, height })
      const layer = new Konva.Layer()
      stage.add(layer)
      for (const l of visible) {
        await addLayerNode(layer, animateLayer(l, tMs, scene.durationMs))
      }
      layer.draw()
      const dataUrl = stage.toDataURL({ pixelRatio: 1, mimeType: 'image/png' })
      const res = await fetch(dataUrl)
      frames.push(new Uint8Array(await res.arrayBuffer()))
      stage.destroy()
    }
    return frames
  } finally {
    container.remove()
  }
}
