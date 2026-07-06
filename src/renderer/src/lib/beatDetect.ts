/**
 * Lightweight, dependency-free beat / tempo detection for the renderer, used to
 * sync a generated reel to a music track. Runs once at convert time (not in the
 * export hot path), so an energy-based onset envelope + autocorrelation BPM is a
 * pragmatic "good enough" trade-off versus pulling a heavy DSP dependency.
 *
 * The pure DSP internals (onsetEnvelope / estimateBpm / beatGrid) are exported
 * for unit testing; `analyzeBeats` is the only function that touches Web Audio.
 */

export interface BeatAnalysis {
  bpm: number
  /** Absolute beat timestamps in ms from the start of the analyzed audio. */
  beats: number[]
  /** 0..1 — how peaky the tempo estimate was. Low values → ignore the grid. */
  confidence: number
  /** Smoothed loudness envelope (per frame) over the whole track. */
  loudness: Float32Array
  /** Frames per second of `loudness`. */
  loudnessRate: number
  /** Total analyzed duration in ms. */
  durationMs: number
}

/** Hop size (samples) for framing the onset envelope. */
const HOP = 512
const BPM_MIN = 70
const BPM_MAX = 180
/** Below this confidence the beat grid is unreliable; callers fall back. */
export const MIN_CONFIDENCE = 0.18

/**
 * Per-frame onset-strength envelope. Uses log-compressed RMS energy (so quiet
 * and loud passages contribute comparably, like human loudness perception),
 * then takes the half-wave-rectified first difference to highlight energy
 * *increases* (note/beat onsets). Finally smooths slightly to suppress noise.
 *
 * Length = floor(pcm.length / hopSize). All values ≥ 0.
 */
export function onsetEnvelope(
  pcm: Float32Array,
  _sampleRate: number,
  hopSize: number
): Float32Array {
  const frames = Math.floor(pcm.length / hopSize)
  const energy = new Float32Array(frames)
  for (let f = 0; f < frames; f++) {
    let sum = 0
    const start = f * hopSize
    for (let i = 0; i < hopSize; i++) {
      const s = pcm[start + i]
      sum += s * s
    }
    // Log-compressed energy: emphasises onsets across a wide dynamic range.
    energy[f] = Math.log1p(1000 * Math.sqrt(sum / hopSize))
  }
  const raw = new Float32Array(frames)
  for (let f = 1; f < frames; f++) {
    const diff = energy[f] - energy[f - 1]
    raw[f] = diff > 0 ? diff : 0
  }
  // Light 3-tap smoothing to reduce frame-to-frame jitter.
  const env = new Float32Array(frames)
  for (let f = 0; f < frames; f++) {
    const a = raw[f - 1] ?? 0
    const b = raw[f]
    const c = raw[f + 1] ?? 0
    env[f] = (a + 2 * b + c) / 4
  }
  return env
}

/** Mean of an array (0 for empty). */
function mean(a: Float32Array): number {
  if (a.length === 0) return 0
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i]
  return s / a.length
}

/** Lag (frames) for a given BPM. */
function bpmToLag(bpm: number, envRate: number): number {
  return (60 / bpm) * envRate
}

/**
 * Estimate BPM from an onset envelope. Rather than picking the single highest
 * autocorrelation lag (which is fooled by octave errors and metric subdivisions),
 * we score every candidate BPM in [BPM_MIN, BPM_MAX] with a comb filter that sums
 * the autocorrelation at the candidate period *and its first few multiples*. The
 * candidate whose pulse train best explains the onsets wins, which collapses
 * half/double-tempo ambiguity onto a single stable answer.
 *
 * `confidence` is the winning score's prominence over the median candidate
 * score — high when one tempo clearly dominates, low for arrhythmic audio.
 */
export function estimateBpm(
  env: Float32Array,
  envRate: number,
  range: [number, number] = [BPM_MIN, BPM_MAX]
): { bpm: number; confidence: number } {
  if (env.length < 8 || envRate <= 0) return { bpm: 0, confidence: 0 }

  // Mean-removed, normalised autocorrelation, computed once per lag.
  const m = mean(env)
  const maxLag = Math.min(env.length - 1, Math.ceil(bpmToLag(range[0], envRate)) + 2)
  const ac = new Float32Array(maxLag + 1)
  let norm = 0
  for (let i = 0; i < env.length; i++) norm += (env[i] - m) * (env[i] - m)
  norm = norm || 1
  for (let lag = 1; lag <= maxLag; lag++) {
    let s = 0
    for (let i = lag; i < env.length; i++) s += (env[i] - m) * (env[i - lag] - m)
    ac[lag] = s / norm
  }

  // Sample autocorrelation at a fractional lag (linear interpolation).
  const acAt = (lag: number): number => {
    if (lag < 1 || lag >= maxLag) return 0
    const lo = Math.floor(lag)
    const frac = lag - lo
    return ac[lo] * (1 - frac) + ac[lo + 1] * frac
  }

  // Score each candidate BPM with a comb filter over the first 4 harmonics.
  const harmonics = [1, 2, 3, 4]
  const weights = [1, 0.8, 0.6, 0.4]
  const scores: { bpm: number; score: number }[] = []
  let best = { bpm: 0, score: -Infinity }
  for (let bpm = range[0]; bpm <= range[1]; bpm += 0.5) {
    const baseLag = bpmToLag(bpm, envRate)
    let score = 0
    for (let hI = 0; hI < harmonics.length; hI++) {
      score += weights[hI] * acAt(baseLag / harmonics[hI])
    }
    scores.push({ bpm, score })
    if (score > best.score) best = { bpm, score }
  }

  if (best.score <= 0) return { bpm: 0, confidence: 0 }

  // Confidence: how far the winner stands above the typical candidate.
  const sortedScores = scores.map((s) => s.score).sort((a, b) => a - b)
  const median = sortedScores[Math.floor(sortedScores.length / 2)]
  const confidence = Math.max(0, Math.min(1, (best.score - median) / (best.score + 1e-9)))

  return { bpm: best.bpm, confidence }
}

/**
 * Generate a beat grid (ms timestamps) spanning [0, totalMs] for a given BPM.
 *
 * Phase is found by sliding a pulse train (one impulse per beat) across the
 * whole onset envelope and choosing the offset whose pulses collect the most
 * onset energy — far more robust than only looking at the first beat period.
 */
export function beatGrid(
  bpm: number,
  env: Float32Array,
  envRate: number,
  totalMs: number
): number[] {
  if (bpm <= 0 || totalMs <= 0) return []
  const intervalMs = 60000 / bpm
  const framesPerBeat = (intervalMs / 1000) * envRate
  if (framesPerBeat < 1 || env.length === 0) {
    // Degenerate: emit an unphased grid.
    const out: number[] = []
    for (let t = 0; t <= totalMs; t += intervalMs) out.push(Math.round(t))
    return out
  }

  // Try each integer phase offset within one beat period; score = summed onset
  // energy hit by the pulse train at that phase.
  const maxPhase = Math.min(env.length, Math.ceil(framesPerBeat))
  let bestPhase = 0
  let bestScore = -Infinity
  for (let p = 0; p < maxPhase; p++) {
    let score = 0
    for (let f = p; f < env.length; f += framesPerBeat) {
      score += env[Math.round(f)] ?? 0
    }
    if (score > bestScore) {
      bestScore = score
      bestPhase = p
    }
  }

  const phaseMs = (bestPhase / envRate) * 1000
  const beats: number[] = []
  for (let t = phaseMs; t <= totalMs; t += intervalMs) {
    if (t >= 0) beats.push(Math.round(t))
  }
  return beats
}

/**
 * Smoothed per-frame loudness (RMS) envelope over the whole signal. Unlike the
 * onset envelope (which highlights *changes*), this tracks sustained energy, so
 * its high-energy regions correspond to choruses / drops.
 */
export function loudnessEnvelope(pcm: Float32Array, hopSize: number): Float32Array {
  const frames = Math.floor(pcm.length / hopSize)
  const rms = new Float32Array(frames)
  for (let f = 0; f < frames; f++) {
    let sum = 0
    const start = f * hopSize
    for (let i = 0; i < hopSize; i++) {
      const s = pcm[start + i]
      sum += s * s
    }
    rms[f] = Math.sqrt(sum / hopSize)
  }
  // Smooth over ~2% of the track (≈ a few seconds) to ignore transient peaks
  // and capture sustained high-energy sections (drops / choruses).
  return smooth(rms, Math.max(3, Math.round(frames * 0.02)))
}

/** Box smoothing with a symmetric window of `radius` frames. */
function smooth(a: Float32Array, radius: number): Float32Array {
  const out = new Float32Array(a.length)
  let acc = 0
  const r = Math.max(1, radius)
  for (let i = 0; i < a.length; i++) {
    acc += a[i]
    if (i >= 2 * r + 1) acc -= a[i - (2 * r + 1)]
    const denom = Math.min(i + 1, 2 * r + 1)
    out[Math.max(0, i - r)] = acc / denom
  }
  return out
}

/**
 * Find the start time (ms) of the most energetic `windowMs` section of the
 * track — typically the drop / chorus — so a long song can be trimmed to its
 * best part for a short reel. The result is snapped to the nearest beat when a
 * beat grid is supplied, so the section starts on a beat.
 */
export function findHighlightMs(
  loudness: Float32Array,
  loudnessRate: number,
  durationMs: number,
  windowMs: number,
  beats?: number[]
): number {
  if (loudness.length === 0 || loudnessRate <= 0) return 0
  // If the track is shorter than the window, start at 0.
  if (windowMs >= durationMs) return 0

  const winFrames = Math.max(1, Math.round((windowMs / 1000) * loudnessRate))
  if (winFrames >= loudness.length) return 0

  // Sliding-window sum of loudness; pick the window with the most energy.
  let acc = 0
  for (let i = 0; i < winFrames; i++) acc += loudness[i]
  let bestSum = acc
  let bestStart = 0
  for (let i = winFrames; i < loudness.length; i++) {
    acc += loudness[i] - loudness[i - winFrames]
    if (acc > bestSum) {
      bestSum = acc
      bestStart = i - winFrames + 1
    }
  }

  let startMs = (bestStart / loudnessRate) * 1000
  // Snap to the nearest beat so the section begins on the pulse.
  if (beats && beats.length > 0) {
    let best = startMs
    let bestDist = Infinity
    for (const b of beats) {
      const d = Math.abs(b - startMs)
      if (d < bestDist) {
        bestDist = d
        best = b
      }
    }
    // Only snap if it doesn't push the window past the track end.
    if (best + windowMs <= durationMs) startMs = best
  }
  return Math.max(0, Math.round(startMs))
}

/** Mix interleaved/multi-channel buffer down to a mono Float32Array. */
function toMono(buf: AudioBuffer): Float32Array {
  const ch = buf.numberOfChannels
  if (ch === 1) return buf.getChannelData(0)
  const len = buf.length
  const out = new Float32Array(len)
  for (let c = 0; c < ch; c++) {
    const data = buf.getChannelData(c)
    for (let i = 0; i < len; i++) out[i] += data[i] / ch
  }
  return out
}

/**
 * Decode an audio asset URL and estimate tempo, a beat grid spanning the whole
 * track, and a loudness envelope (for highlight detection). Tempo is estimated
 * from the first `bpmWindowSeconds` for speed; the beat grid and loudness cover
 * the entire track so a long song can be trimmed to its best section.
 *
 * On decode failure or low confidence, returns an empty beat grid so callers
 * degrade to heuristic timing.
 */
export async function analyzeBeats(
  url: string,
  opts?: { bpmWindowSeconds?: number }
): Promise<BeatAnalysis> {
  const bpmWindow = opts?.bpmWindowSeconds ?? 60
  const empty: BeatAnalysis = {
    bpm: 0,
    beats: [],
    confidence: 0,
    loudness: new Float32Array(0),
    loudnessRate: 0,
    durationMs: 0
  }
  try {
    const res = await fetch(url)
    const arrayBuf = await res.arrayBuffer()
    const Ctx: typeof OfflineAudioContext =
      (window as unknown as { OfflineAudioContext: typeof OfflineAudioContext })
        .OfflineAudioContext ||
      (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
        .webkitOfflineAudioContext
    const ctx = new Ctx(1, 1, 44100)
    const audioBuf = await ctx.decodeAudioData(arrayBuf)

    const sampleRate = audioBuf.sampleRate
    const pcm = toMono(audioBuf)
    const envRate = sampleRate / HOP
    const totalMs = (pcm.length / sampleRate) * 1000

    // Tempo: estimate from the first window (cheaper, and intros are usually
    // representative enough for the grid period).
    const bpmSamples = Math.min(pcm.length, Math.floor(bpmWindow * sampleRate))
    const onsetEnv = onsetEnvelope(pcm.subarray(0, bpmSamples), sampleRate, HOP)
    const { bpm, confidence } = estimateBpm(onsetEnv, envRate)

    // Full-track onset envelope for phase-correct beats across the whole song.
    const fullOnset = onsetEnvelope(pcm, sampleRate, HOP)
    const beats = confidence >= MIN_CONFIDENCE ? beatGrid(bpm, fullOnset, envRate, totalMs) : []

    const loudness = loudnessEnvelope(pcm, HOP)

    return {
      bpm: Math.round(bpm),
      beats,
      confidence,
      loudness,
      loudnessRate: envRate,
      durationMs: totalMs
    }
  } catch {
    return empty
  }
}
