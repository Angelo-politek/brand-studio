import { removeBackground, type RemoveBackgroundOptions } from '@renderer/lib/python'
import { makeImageThumbnail, downscaleImageBytes } from '@renderer/lib/thumbnail'
import { checkpointHistory } from '@renderer/stores/editorStore'
import { mediaUrl } from '@shared/ipc'
import type { Layer } from '@shared/types'

/**
 * Import processed image bytes as a new brand asset and repoint a layer's src
 * to it, forcing a distinct undo checkpoint. Shared by the Inspector and the
 * canvas context menu. The superseded generated asset is intentionally NOT
 * deleted (Ctrl+Z must restore the previous src); "Clean unused" reclaims them.
 */
export async function saveProcessedLayerSrc(
  layer: Layer,
  brandId: string,
  out: Uint8Array,
  suffix: string,
  tag: string,
  updateLayer: (id: string, patch: Partial<Layer>) => void
): Promise<void> {
  const blob = new Blob([out as BlobPart], { type: 'image/png' })
  const thumb = await makeImageThumbnail(blob)
  const asset = await window.api.assets.import({
    brandId,
    folder: 'Images',
    name: `${layer.name}-${suffix}.png`,
    mime: 'image/png',
    bytes: out,
    width: thumb?.width ?? null,
    height: thumb?.height ?? null,
    thumbBytes: thumb?.bytes ?? null,
    tags: [tag]
  })
  checkpointHistory()
  updateLayer(layer.id, { src: asset.filePath })
}

/**
 * Remove the background of an image layer and repoint it. Returns true on
 * success, false when there's nothing to do or the backend is offline (the
 * caller surfaces the message). Throws are left to the caller to toast.
 */
export async function removeLayerBackground(
  layer: Layer,
  brandId: string,
  updateLayer: (id: string, patch: Partial<Layer>) => void,
  opts: RemoveBackgroundOptions = {}
): Promise<boolean> {
  if (layer.type !== 'image' || !layer.src) return false
  const srcBytes = new Uint8Array(await (await fetch(mediaUrl(layer.src))).arrayBuffer())
  const capped = await downscaleImageBytes(srcBytes, 1400)
  const out = await removeBackground(capped, `${layer.name}.png`, opts)
  if (!out) return false
  await saveProcessedLayerSrc(layer, brandId, out, 'nobg', 'nobg', updateLayer)
  return true
}
