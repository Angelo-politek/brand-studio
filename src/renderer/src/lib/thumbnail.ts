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
