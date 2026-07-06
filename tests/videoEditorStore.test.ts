import { describe, it, expect } from 'vitest'
import { splitSceneParts } from '../src/renderer/src/stores/videoEditorStore'
import type { VideoScene, VideoClip, Layer } from '../src/shared/types'

function makeLayer(id: string): Layer {
  return {
    id,
    type: 'text',
    name: 'T',
    visible: true,
    locked: false,
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1
  } as Layer
}

function makeScene(over: Partial<VideoScene> = {}): VideoScene {
  return {
    id: 'scene-1',
    name: 'Scene 1',
    durationMs: 3000,
    background: '#000000',
    layers: [makeLayer('l1')],
    transitionIn: { type: 'fade', durationMs: 400 },
    ...over
  }
}

function makeClip(over: Partial<VideoClip> = {}): VideoClip {
  return {
    src: 'assets/x.mp4',
    inMs: 500,
    outMs: 3500,
    sourceDurMs: 10000,
    volume: 1,
    muted: false,
    fit: 'cover',
    look: 'none',
    x: 0,
    y: 0,
    width: 1080,
    height: 1920,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    crop: null,
    ...over
  } as VideoClip
}

describe('splitSceneParts', () => {
  it('splits durations at the cut point', () => {
    const [a, b] = splitSceneParts(makeScene(), 1000)!
    expect(a.durationMs).toBe(1000)
    expect(b.durationMs).toBe(2000)
  })

  it('first part keeps id and transition; second gets a fresh id and none', () => {
    const scene = makeScene()
    const [a, b] = splitSceneParts(scene, 1000)!
    expect(a.id).toBe(scene.id)
    expect(a.transitionIn?.type).toBe('fade')
    expect(b.id).not.toBe(scene.id)
    expect(b.transitionIn).toBeUndefined()
  })

  it('clones layers with new ids in the second part', () => {
    const scene = makeScene()
    const [a, b] = splitSceneParts(scene, 1000)!
    expect(a.layers[0].id).toBe('l1')
    expect(b.layers[0].id).not.toBe('l1')
  })

  it('advances the clip trim across the cut', () => {
    const scene = makeScene({ clip: makeClip() })
    const [a, b] = splitSceneParts(scene, 1000)!
    expect(a.clip!.inMs).toBe(500)
    expect(a.clip!.outMs).toBe(1500)
    expect(b.clip!.inMs).toBe(1500)
    expect(b.clip!.outMs).toBe(3500)
  })

  it('drops the clip in the second part when it ends before the cut', () => {
    const scene = makeScene({ clip: makeClip({ inMs: 0, outMs: 800 }) })
    const [a, b] = splitSceneParts(scene, 1000)!
    expect(a.clip!.outMs).toBe(800)
    expect(b.clip).toBeUndefined()
  })

  it('refuses cuts that leave a part shorter than 200ms', () => {
    expect(splitSceneParts(makeScene(), 100)).toBeNull()
    expect(splitSceneParts(makeScene(), 2900)).toBeNull()
    expect(splitSceneParts(makeScene(), 1000)).not.toBeNull()
  })

  it('does not mutate the input scene', () => {
    const scene = makeScene({ clip: makeClip() })
    const snapshot = JSON.parse(JSON.stringify(scene))
    splitSceneParts(scene, 1000)
    expect(scene).toEqual(snapshot)
  })
})
