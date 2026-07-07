// Renderer-side thumbnail generation via an offscreen canvas — avoids a native
// image library in the main process and a Python round-trip for the common case.

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

export interface ThumbResult {
  bytes: Uint8Array
  width: number
  height: number
}

/**
 * Downscale raw image bytes so the long side is at most `maxSide` px.
 * Returns the original bytes when already within bounds (or on any failure).
 */
export async function downscaleImageBytes(bytes: Uint8Array, maxSide: number): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart]))
  try {
    const img = await loadImage(url)
    const w = img.naturalWidth || img.width
    const h = img.naturalHeight || img.height
    if (!w || !h || Math.max(w, h) <= maxSide) return bytes
    const scale = maxSide / Math.max(w, h)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(w * scale))
    canvas.height = Math.max(1, Math.round(h * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return bytes
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), 'image/png'))
    return blob ? new Uint8Array(await blob.arrayBuffer()) : bytes
  } catch {
    return bytes
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Downscale an image Blob to a PNG thumbnail and report natural dimensions. */
export async function makeImageThumbnail(file: Blob, max = 320): Promise<ThumbResult | null> {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const width = img.naturalWidth || img.width || max
    const height = img.naturalHeight || img.height || max
    const scale = Math.min(1, max / Math.max(width, height))
    const tw = Math.max(1, Math.round(width * scale))
    const th = Math.max(1, Math.round(height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = tw
    canvas.height = th
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, tw, th)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), 'image/png'))
    if (!blob) return null
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height }
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}
