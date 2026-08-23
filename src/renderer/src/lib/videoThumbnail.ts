import Konva from 'konva'
import { mediaUrl } from '@shared/ipc'
import { dataUrlToBytes } from './bytes'
import { addLayerNodeForThumbnail } from './videoExport'
import type { VideoScene } from '@shared/types'

/**
 * Render a video project's first scene to a small PNG thumbnail, entirely
 * off-screen (a fresh Konva stage + a throwaway <video> element) so it never
 * disturbs whatever scene is currently shown in the live editor stage. Mirrors
 * `lib/pageThumbnail.ts` for design pages; kept as a separate module because
 * scenes additionally carry an optional background video clip.
 *
 * Renderer-only by design: the app must stay usable with the Python sidecar
 * down, and the renderer can already rasterize a scene via Konva — no need to
 * round-trip through the (unused) `/video-thumbnail` sidecar route.
 */

/** Load one frame of a video file as an HTMLVideoElement, seeked to `atMs`. */
function loadVideoFrame(src: string, atMs: number, timeoutMs = 8000): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.crossOrigin = 'anonymous'
    v.preload = 'auto'
    v.muted = true
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error('video frame load timed out'))
    }, timeoutMs)
    const cleanup = (): void => {
      clearTimeout(timer)
      v.onloadeddata = null
      v.onseeked = null
      v.onerror = null
    }
    v.onloadeddata = () => {
      try {
        v.currentTime = Math.max(0, atMs / 1000)
      } catch {
        if (!settled) {
          settled = true
          cleanup()
          resolve(v)
        }
      }
    }
    v.onseeked = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve(v)
    }
    v.onerror = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error('video failed to load'))
    }
    v.src = mediaUrl(src)
  })
}

/**
 * Render `scene` (background color, optional clip frame, overlay layers) into
 * a PNG data-URL scaled so the long side is at most `max` px.
 */
export async function generateSceneThumbnail(
  scene: VideoScene,
  projectWidth: number,
  projectHeight: number,
  max = 400
): Promise<string> {
  const scale = Math.min(1, max / Math.max(projectWidth, projectHeight))

  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '-99999px'
  document.body.appendChild(container)

  const stage = new Konva.Stage({
    container,
    width: projectWidth * scale,
    height: projectHeight * scale
  })
  const layer = new Konva.Layer()
  stage.add(layer)
  stage.scale({ x: scale, y: scale })

  try {
    if (scene.background !== 'transparent') {
      layer.add(
        new Konva.Rect({
          x: 0,
          y: 0,
          width: projectWidth,
          height: projectHeight,
          fill: scene.background
        })
      )
    }

    if (scene.clip) {
      try {
        const video = await loadVideoFrame(scene.clip.src, scene.clip.inMs)
        layer.add(
          new Konva.Image({
            x: scene.clip.x,
            y: scene.clip.y,
            width: scene.clip.width,
            height: scene.clip.height,
            rotation: scene.clip.rotation,
            opacity: scene.clip.opacity,
            crop: scene.clip.crop ?? undefined,
            image: video
          })
        )
      } catch (e) {
        // A missing/broken clip must not block the thumbnail — fall through
        // with just the background + overlays.
        console.warn('[video thumbnail] skipped clip frame:', e)
      }
    }

    for (const l of scene.layers) {
      if (!l.visible) continue
      try {
        await addLayerNodeForThumbnail(layer, l)
      } catch (e) {
        console.warn('[video thumbnail] skipped a layer:', l.type, l.id, e)
      }
    }

    layer.draw()
    return stage.toDataURL({ pixelRatio: 1, mimeType: 'image/png' })
  } finally {
    stage.destroy()
    container.remove()
  }
}

/** Convenience wrapper: render the project's first scene straight to bytes. */
export async function generateVideoProjectThumbBytes(
  scenes: VideoScene[],
  width: number,
  height: number,
  max = 400
): Promise<Uint8Array | null> {
  const first = scenes[0]
  if (!first) return null
  const dataUrl = await generateSceneThumbnail(first, width, height, max)
  return dataUrlToBytes(dataUrl)
}
