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
 * Draw a slice of a waveform into a canvas as a centered min/max strip.
 * `fromMs`/`toMs` select the audible window (e.g. music inMs offset).
 */
export function drawWaveform(
  canvas: HTMLCanvasElement,
  wf: Waveform,
  color: string,
  fromMs = 0,
  toMs = wf.durationMs
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { width, height } = canvas
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = color
  const n = wf.peaks.length
  const b0 = Math.max(0, Math.floor((fromMs / wf.durationMs) * n))
  const b1 = Math.min(n, Math.ceil((toMs / wf.durationMs) * n))
  const span = Math.max(1, b1 - b0)
  const mid = height / 2
  for (let x = 0; x < width; x++) {
    const b = b0 + Math.floor((x / width) * span)
    const amp = wf.peaks[Math.min(n - 1, b)] ?? 0
    const h = Math.max(1, amp * (height - 2))
    ctx.fillRect(x, mid - h / 2, 1, h)
  }
}
