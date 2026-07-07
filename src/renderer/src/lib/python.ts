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

/** Drop the cached {port, token} so the next call re-fetches it (after a restart). */
export function resetPythonInfoCache(): void {
  info = null
}

export async function isPythonReady(): Promise<boolean> {
  return (await base()) != null
}

export interface PaletteColor {
  hex: string
  weight: number
}

export interface RemoveBackgroundOptions {
  /** Portrait-tuned model instead of the general one. */
  human?: boolean
  /** Alpha matting for soft edges (hair, glass) — slower. */
  softEdges?: boolean
}

/** Remove the background of an image, returning transparent PNG bytes (or null if offline). */
export async function removeBackground(
  bytes: Uint8Array,
  filename: string,
  opts: RemoveBackgroundOptions = {}
): Promise<Uint8Array | null> {
  const root = await base()
  if (!root) return null
  const form = new FormData()
  form.append('file', new Blob([bytes as BlobPart]), filename)
  form.append('model', opts.human ? 'u2net_human_seg' : 'isnet-general-use')
  form.append('alpha_matting', String(opts.softEdges ?? false))
  const res = await fetch(`${root}/bg-remove`, {
    method: 'POST',
    headers: authHeaders(),
    body: form
  })
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
  const res = await fetch(`${root}/image/recolor`, {
    method: 'POST',
    headers: authHeaders(),
    body: form
  })
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
  const res = await fetch(`${root}/image/tint`, {
    method: 'POST',
    headers: authHeaders(),
    body: form
  })
  if (!res.ok) throw new Error(`tint failed: ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

/** One scene in the export payload. Overlays are pre-written under the data root. */
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
  /** Absolute path of a static overlay PNG under cache/video-export, or null. */
  overlayPath?: string | null
  /** Absolute path of a dir of animated overlay frames (f_%05d.png), or null. */
  framesDir?: string | null
}

export interface VideoExportParams {
  outputPath: string
  width: number
  height: number
  scenes: ExportScene[]
  /** FPS of the animated overlay frame sequences. */
  overlayFps?: number
  audio?: { path: string; volume: number; inMs: number; fadeOutMs?: number } | null
  /** Per-export work dir (cache/video-export/<id>) — cleaned up by the backend. */
  workDir?: string | null
}

export interface VideoJobStatus {
  job_id: string
  state: 'running' | 'done' | 'error' | 'cancelled'
  progress: number
  stage: string
  error: string | null
  output_path: string | null
}

/**
 * Start a timeline video export job in the Python sidecar.
 * Returns the job id, or null if Python is offline. Poll with getVideoJob.
 */
export async function startVideoExport(params: VideoExportParams): Promise<string | null> {
  const root = await base()
  if (!root) return null
  const res = await fetch(`${root}/video/export`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      outputPath: params.outputPath,
      width: params.width,
      height: params.height,
      scenes: params.scenes,
      audio: params.audio ?? null,
      overlayFps: params.overlayFps ?? 30,
      workDir: params.workDir ?? null
    })
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`video export failed: ${text}`)
  }
  const data = (await res.json()) as VideoJobStatus
  return data.job_id
}

export async function getVideoJob(jobId: string): Promise<VideoJobStatus> {
  const root = await base()
  if (!root) throw new Error('backend offline')
  const res = await fetch(`${root}/video/jobs/${jobId}`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`job status failed: ${res.status}`)
  return (await res.json()) as VideoJobStatus
}

export async function cancelVideoJob(jobId: string): Promise<void> {
  const root = await base()
  if (!root) return
  await fetch(`${root}/video/jobs/${jobId}/cancel`, {
    method: 'POST',
    headers: authHeaders()
  }).catch(() => undefined)
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
  const res = await fetch(`${root}/image/palette`, {
    method: 'POST',
    headers: authHeaders(),
    body: form
  })
  if (!res.ok) return []
  const data = (await res.json()) as { colors: PaletteColor[] }
  return data.colors
}
