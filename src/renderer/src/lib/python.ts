// Thin client for the local FastAPI sidecar. The renderer calls it directly
// over localhost; the port + auth token are provided by the Electron main process.

let info: { port: number; token: string } | null = null

async function base(): Promise<string | null> {
  if (info == null) info = await window.api.app.getPythonInfo()
  return info != null ? `http://127.0.0.1:${info.port}` : null
}

/** Bearer header required by every sidecar route except /health. */
function authHeaders(): Record<string, string> {
  return info ? { Authorization: `Bearer ${info.token}` } : {}
}

export async function isPythonReady(): Promise<boolean> {
  return (await base()) != null
}

export interface PaletteColor {
  hex: string
  weight: number
}

/** Remove the background of an image, returning transparent PNG bytes (or null if offline). */
export async function removeBackground(
  bytes: Uint8Array,
  filename: string
): Promise<Uint8Array | null> {
  const root = await base()
  if (!root) return null
  const form = new FormData()
  form.append('file', new Blob([bytes as BlobPart]), filename)
  const res = await fetch(`${root}/bg-remove`, { method: 'POST', headers: authHeaders(), body: form })
  if (!res.ok) throw new Error(`bg-remove failed: ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

/** Remap an image's colours onto a brand palette. Returns PNG bytes (or null if offline). */
export async function recolorToPalette(
  bytes: Uint8Array,
  filename: string,
  colors: string[]
): Promise<Uint8Array | null> {
  const root = await base()
  if (!root) return null
  const form = new FormData()
  form.append('file', new Blob([bytes as BlobPart], { type: 'image/png' }), filename)
  form.append('colors', colors.join(','))
  const res = await fetch(`${root}/image/recolor`, { method: 'POST', headers: authHeaders(), body: form })
  if (!res.ok) throw new Error(`recolor failed: ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

/**
 * Apply a color tint/blend to an image via the Python backend.
 * Returns PNG bytes, or null if Python is offline.
 */
export async function tintImage(
  bytes: Uint8Array,
  filename: string,
  color: string,
  intensity: number,
  mode: 'multiply' | 'overlay' | 'color' = 'multiply'
): Promise<Uint8Array | null> {
  const root = await base()
  if (!root) return null
  const form = new FormData()
  form.append('file', new Blob([bytes as BlobPart], { type: 'image/png' }), filename)
  form.append('color', color)
  form.append('intensity', String(intensity))
  form.append('mode', mode)
  const res = await fetch(`${root}/image/tint`, { method: 'POST', headers: authHeaders(), body: form })
  if (!res.ok) throw new Error(`tint failed: ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

/** One scene in the export payload. Overlay PNG (if any) is sent separately. */
export interface ExportScene {
  durationMs: number
  background: string
  clip?: {
    src: string // absolute path
    inMs: number
    outMs: number
    volume: number
    muted: boolean
    fit: 'cover' | 'contain'
    look?: string
    x: number
    y: number
    width: number
    height: number
    crop?: { x: number; y: number; width: number; height: number } | null
    naturalWidth?: number | null
    naturalHeight?: number | null
  } | null
  transitionIn?: { type: string; durationMs: number }
}

export interface VideoExportParams {
  outputPath: string
  width: number
  height: number
  scenes: ExportScene[]
  /** Per-scene static overlay PNGs (index-aligned with scenes; null = none). */
  overlays: (Uint8Array | null)[]
  /** Per-scene animated overlay frame sequences (null = use static overlay). */
  frames?: (Uint8Array[] | null)[]
  /** FPS used for animated overlay frame sequences. */
  overlayFps?: number
  audio?: { path: string; volume: number; inMs: number } | null
}

/**
 * Export a timeline video via FFmpeg in the Python sidecar.
 * Returns the output path on success, null if Python is offline.
 * Throws with FFmpeg stderr if it fails.
 */
export async function exportVideo(params: VideoExportParams): Promise<string | null> {
  const root = await base()
  if (!root) return null
  const form = new FormData()
  form.append(
    'payload',
    JSON.stringify({
      outputPath: params.outputPath,
      width: params.width,
      height: params.height,
      scenes: params.scenes,
      audio: params.audio ?? null,
      overlayFps: params.overlayFps ?? 15
    })
  )
  params.overlays.forEach((bytes, i) => {
    // Animated frame sequence takes precedence over a static overlay.
    const seq = params.frames?.[i]
    if (seq && seq.length > 0) {
      seq.forEach((f, j) => {
        form.append(`frames_${i}_${j}`, new Blob([f as BlobPart], { type: 'image/png' }), `f_${j}.png`)
      })
    } else if (bytes && bytes.byteLength > 0) {
      form.append(`overlay_${i}`, new Blob([bytes as BlobPart], { type: 'image/png' }), `overlay_${i}.png`)
    }
  })
  const res = await fetch(`${root}/video/export`, { method: 'POST', headers: authHeaders(), body: form })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`video export failed: ${text}`)
  }
  const data = (await res.json()) as { output_path: string }
  return data.output_path
}

/** Extract a dominant-colour palette via the backend KMeans endpoint. */
export async function extractPalette(
  bytes: Uint8Array,
  filename: string,
  k = 6
): Promise<PaletteColor[]> {
  const root = await base()
  if (!root) return []
  const form = new FormData()
  form.append('file', new Blob([bytes as BlobPart]), filename)
  form.append('k', String(k))
  const res = await fetch(`${root}/image/palette`, { method: 'POST', headers: authHeaders(), body: form })
  if (!res.ok) return []
  const data = (await res.json()) as { colors: PaletteColor[] }
  return data.colors
}
