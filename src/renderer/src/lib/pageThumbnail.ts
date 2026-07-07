import Konva from 'konva'
import type { Page } from '@shared/types'

/**
 * Render a design page to a small data-URL thumbnail off-screen. Reuses the
 * export layer builder so the mini-preview matches the real artboard. Results
 * are cached per page signature (id + layer count + a cheap content hash) so
 * panels don't re-rasterize on every render.
 */

const cache = new Map<string, string>()

function signature(page: Page): string {
  // Cheap content fingerprint: enough to invalidate on edits without deep hashing.
  let h = 0
  const str = JSON.stringify(page.layers)
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return `${page.id}:${page.layers.length}:${h}:${page.canvas.background}`
}

/**
 * Return a cached thumbnail synchronously if available, else null. Kick off
 * generation with generatePageThumbnail and subscribe via the returned promise.
 */
export function getCachedPageThumbnail(page: Page): string | null {
  return cache.get(signature(page)) ?? null
}

let addLayerNode: ((layer: Konva.Layer, l: Page['layers'][number]) => Promise<void>) | null = null

/** Lazily import the shared export node builder (avoids a static cycle). */
async function getBuilder(): Promise<typeof addLayerNode> {
  if (!addLayerNode) {
    const mod = await import('./videoExport')
    addLayerNode = mod.addLayerNodeForThumbnail
  }
  return addLayerNode
}

export async function generatePageThumbnail(page: Page, max = 160): Promise<string> {
  const sig = signature(page)
  const hit = cache.get(sig)
  if (hit) return hit

  const cw = page.canvas.width
  const ch = page.canvas.height
  const scale = Math.min(1, max / Math.max(cw, ch))

  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '-99999px'
  document.body.appendChild(container)

  const stage = new Konva.Stage({ container, width: cw * scale, height: ch * scale })
  const layer = new Konva.Layer()
  stage.add(layer)
  // Background.
  if (page.canvas.background !== 'transparent') {
    layer.add(new Konva.Rect({ x: 0, y: 0, width: cw, height: ch, fill: page.canvas.background }))
  }
  stage.scale({ x: scale, y: scale })

  try {
    const build = await getBuilder()
    for (const l of page.layers) {
      if (l.visible) await build!(layer, l)
    }
    layer.draw()
    const url = stage.toDataURL({ pixelRatio: 1, mimeType: 'image/png' })
    cache.set(sig, url)
    // Keep the cache from growing unbounded.
    if (cache.size > 120) cache.delete(cache.keys().next().value!)
    return url
  } finally {
    stage.destroy()
    container.remove()
  }
}
