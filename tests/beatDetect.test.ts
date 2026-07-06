import { describe, it, expect } from 'vitest'
import {
  onsetEnvelope,
  estimateBpm,
  beatGrid,
  loudnessEnvelope,
  findHighlightMs
} from '@renderer/lib/beatDetect'

/** Build a click track: impulses every `periodSec` seconds. */
function clickTrack(sampleRate: number, durationSec: number, periodSec: number): Float32Array {
  const pcm = new Float32Array(Math.floor(sampleRate * durationSec))
  const step = Math.floor(sampleRate * periodSec)
  for (let i = 0; i < pcm.length; i += step) {
    // Short loud impulse.
    for (let j = 0; j < 64 && i + j < pcm.length; j++) pcm[i + j] = 1
  }
  return pcm
}

describe('onsetEnvelope', () => {
  it('returns non-negative values of the expected length', () => {
    const pcm = clickTrack(44100, 2, 0.5)
    const hop = 512
    const env = onsetEnvelope(pcm, 44100, hop)
    expect(env.length).toBe(Math.floor(pcm.length / hop))
    for (let i = 0; i < env.length; i++) expect(env[i]).toBeGreaterThanOrEqual(0)
  })
})

describe('estimateBpm', () => {
  it('estimates ~120 BPM from impulses every 0.5s', () => {
    const sampleRate = 44100
    const hop = 512
    const pcm = clickTrack(sampleRate, 8, 0.5) // 0.5s period → 120 BPM
    const env = onsetEnvelope(pcm, sampleRate, hop)
    const envRate = sampleRate / hop
    const { bpm, confidence } = estimateBpm(env, envRate)
    expect(bpm).toBeGreaterThan(110)
    expect(bpm).toBeLessThan(130)
    expect(confidence).toBeGreaterThan(0)
  })

  it('estimates ~100 BPM from impulses every 0.6s', () => {
    const sampleRate = 44100
    const hop = 512
    const pcm = clickTrack(sampleRate, 10, 0.6) // 0.6s period → 100 BPM
    const env = onsetEnvelope(pcm, sampleRate, hop)
    const { bpm } = estimateBpm(env, sampleRate / hop)
    expect(bpm).toBeGreaterThan(94)
    expect(bpm).toBeLessThan(106)
  })

  it('returns zero for too-short input', () => {
    expect(estimateBpm(new Float32Array([1, 2]), 86).bpm).toBe(0)
  })
})

describe('beatGrid', () => {
  it('spaces beats at 60000/bpm and covers the range', () => {
    const env = new Float32Array(100)
    env[0] = 1
    const grid = beatGrid(120, env, 86, 4000)
    expect(grid.length).toBeGreaterThan(0)
    const interval = grid[1] - grid[0]
    expect(interval).toBeCloseTo(500, 0)
    expect(grid[grid.length - 1]).toBeLessThanOrEqual(4000)
  })

  it('returns empty for invalid bpm', () => {
    expect(beatGrid(0, new Float32Array(10), 86, 4000)).toEqual([])
  })
})

describe('loudnessEnvelope', () => {
  it('tracks sustained energy: louder section reads higher', () => {
    const sr = 44100
    const hop = 512
    // 4s quiet, 4s loud.
    const pcm = new Float32Array(sr * 8)
    for (let i = 0; i < pcm.length; i++) {
      const loud = i > sr * 4
      pcm[i] = (loud ? 0.8 : 0.05) * Math.sin((2 * Math.PI * 220 * i) / sr)
    }
    const env = loudnessEnvelope(pcm, hop)
    const rate = sr / hop
    const quietFrame = Math.floor(2 * rate)
    const loudFrame = Math.floor(6 * rate)
    expect(env[loudFrame]).toBeGreaterThan(env[quietFrame] * 3)
  })
})

describe('findHighlightMs', () => {
  it('locates the most energetic window', () => {
    const sr = 44100
    const hop = 512
    const pcm = new Float32Array(sr * 12)
    for (let i = 0; i < pcm.length; i++) {
      // Loud burst between 6s and 9s.
      const loud = i > sr * 6 && i < sr * 9
      pcm[i] = (loud ? 0.9 : 0.05) * Math.sin((2 * Math.PI * 220 * i) / sr)
    }
    const env = loudnessEnvelope(pcm, hop)
    const rate = sr / hop
    const start = findHighlightMs(env, rate, 12000, 2000)
    // The 2s window should start inside the loud burst (≈6000–7000ms).
    expect(start).toBeGreaterThan(4500)
    expect(start).toBeLessThan(9000)
  })

  it('returns 0 when the window is longer than the track', () => {
    const env = new Float32Array(100).fill(1)
    expect(findHighlightMs(env, 86, 2000, 5000)).toBe(0)
  })

  it('snaps the start to the nearest beat', () => {
    const sr = 44100
    const hop = 512
    const pcm = new Float32Array(sr * 12)
    for (let i = 0; i < pcm.length; i++) {
      const loud = i > sr * 6 && i < sr * 9
      pcm[i] = (loud ? 0.9 : 0.05) * Math.sin((2 * Math.PI * 220 * i) / sr)
    }
    const env = loudnessEnvelope(pcm, hop)
    const rate = sr / hop
    const beats = Array.from({ length: 24 }, (_, i) => i * 500)
    const start = findHighlightMs(env, rate, 12000, 2000, beats)
    expect(start % 500).toBe(0) // landed on a beat
  })
})
