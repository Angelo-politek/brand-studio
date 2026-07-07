/**
 * Audio waveform peaks for timeline strips.
 *
 * Decodes an audio (or video) file via WebAudio and reduces the mono PCM to
 * `buckets` max-amplitude peaks (0..1). Results are cached per url+buckets so
 * scrubbing/re-renders never re-decode. Failures resolve to null (no strip).
 */

export interface Waveform {
  /** Max |amplitude| per bucket, normalized to 0..1. */
  peaks: Float32Array
  durationMs: number
}

const cache = new Map<string, Promise<Waveform | null>>()

export function getWaveform(url: string, buckets = 480): Promise<Waveform | null> {
  const key = `${url}#${buckets}`
  let p = cache.get(key)
  if (!p) {
    p = compute(url, buckets).catch(() => null)
    cache.set(key, p)
  }
  return p
}

async function compute(url: string, buckets: number): Promise<Waveform | null> {
  const res = await fetch(url)
  const arrayBuf = await res.arrayBuffer()
  const Ctx: typeof OfflineAudioContext =
    (window as unknown as { OfflineAudioContext: typeof OfflineAudioContext })
      .OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext
  const ctx = new Ctx(1, 1, 44100)
  const audioBuf = await ctx.decodeAudioData(arrayBuf)

  // Mixdown to mono.
  const ch0 = audioBuf.getChannelData(0)
  let pcm = ch0
  if (audioBuf.numberOfChannels > 1) {
    const mixed = new Float32Array(ch0.length)
    for (let c = 0; c < audioBuf.numberOfChannels; c++) {
      const data = audioBuf.getChannelData(c)
      for (let i = 0; i < data.length; i++) mixed[i] += data[i] / audioBuf.numberOfChannels
    }
    pcm = mixed
  }

  const peaks = new Float32Array(buckets)
  const per = Math.max(1, Math.floor(pcm.length / buckets))
  let max = 0
  for (let b = 0; b < buckets; b++) {
    let m = 0
    const start = b * per
    const end = Math.min(pcm.length, start + per)
    for (let i = start; i < end; i++) {
      const a = Math.abs(pcm[i])
      if (a > m) m = a
    }
    peaks[b] = m
    if (m > max) max = m
  }
  if (max > 0) for (let b = 0; b < buckets; b++) peaks[b] /= max

  return { peaks, durationMs: (pcm.length / audioBuf.sampleRate) * 1000 }
}

/**
 * Draw the WHOLE song as a centered min/max strip, dimming the parts outside
 * the selected reel segment `[selStartMs, selEndMs]` so the user sees exactly
 * which slice of the track the reel uses and where it sits in the song.
 */
export function drawWaveform(
  canvas: HTMLCanvasElement,
  wf: Waveform,
  color: string,
  selStartMs = 0,
  selEndMs = wf.durationMs
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { width, height } = canvas
  ctx.clearRect(0, 0, width, height)
  const n = wf.peaks.length
  const mid = height / 2
  const dur = wf.durationMs || 1
  const selX0 = (selStartMs / dur) * width
  const selX1 = Math.min(width, (selEndMs / dur) * width)

  // Shaded selection band behind the wave.
  ctx.fillStyle = 'rgba(249, 115, 22, 0.18)'
  ctx.fillRect(selX0, 0, Math.max(1, selX1 - selX0), height)

  for (let x = 0; x < width; x++) {
    const b = Math.floor((x / width) * n)
    const amp = wf.peaks[Math.min(n - 1, b)] ?? 0
    const h = Math.max(1, amp * (height - 2))
    // Bright inside the selection, dim outside.
    ctx.fillStyle = x >= selX0 && x <= selX1 ? color : 'rgba(148, 163, 184, 0.4)'
    ctx.fillRect(x, mid - h / 2, 1, h)
  }

  // Start marker.
  ctx.fillStyle = '#f97316'
  ctx.fillRect(Math.max(0, selX0 - 1), 0, 2, height)
}
