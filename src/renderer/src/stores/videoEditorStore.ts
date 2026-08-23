import { create } from 'zustand'
import { temporal } from 'zundo'
import { v4 as uuid } from 'uuid'
import { coalesceHistory } from './editorStore'
import {
  createLayerSlice,
  layerSliceInitialState,
  type LayerSliceActions,
  type LayerSliceState
} from './layerSlice'
import type {
  AudioTrack,
  CanvasSpec,
  Layer,
  SceneTransitionType,
  VideoClip,
  VideoProject,
  VideoScene
} from '@shared/types'

const DEFAULT_SCENE_MS = 4000

/**
 * Editor store for the timeline video editor. Shares the design editor's whole
 * layer/selection/alignment surface via `createLayerSlice` (canvas, layers,
 * selectedIds + layer/select/align/crop actions) so the shared canvas
 * components work unchanged, and adds scene/clip/audio/playhead state for the
 * timeline.
 *
 * `canvas` and `layers` mirror the ACTIVE scene; edits sync back into
 * `scenes` via `syncScenes`.
 */
interface VideoEditorState extends LayerSliceState, LayerSliceActions {
  projectId: string | null
  brandId: string | null
  name: string
  width: number
  height: number

  scenes: VideoScene[]
  activeSceneId: string

  // Mirrors of the active scene (shared canvas components read these).
  canvas: CanvasSpec
  layers: Layer[]

  // Global background music.
  audio: AudioTrack | null

  gridSize: number

  // Playback (excluded from undo history).
  playheadMs: number
  playing: boolean

  loadProject: (p: VideoProject) => void
  setName: (name: string) => void

  // Scenes
  setActiveScene: (id: string) => void
  addScene: (scene?: Partial<VideoScene>) => void
  deleteScene: (id: string) => void
  duplicateScene: (id: string) => void
  renameScene: (id: string, name: string) => void
  setSceneDuration: (id: string, durationMs: number) => void
  reorderScene: (id: string, toIndex: number) => void
  /** Split the active scene at the current playhead (clip trims follow). */
  splitSceneAtPlayhead: () => void
  setSceneTransition: (id: string, type: SceneTransitionType, durationMs?: number) => void

  // Clip / audio
  setSceneClip: (sceneId: string, clip: VideoClip | null) => void
  updateClip: (sceneId: string, patch: Partial<VideoClip>) => void
  setAudio: (audio: AudioTrack | null) => void
  updateAudio: (patch: Partial<AudioTrack>) => void

  // Playback
  setPlayhead: (ms: number) => void
  setPlaying: (p: boolean) => void
  /** Seek to a GLOBAL timeline position (ms): sets active scene + local playhead. */
  seekGlobal: (ms: number) => void

  toProject: () => VideoProject
}

/**
 * Split a scene at `atMs` (scene-local time) into two scenes. The first keeps
 * the id/transition and plays [0, atMs); the second plays the rest, with the
 * clip trim advanced accordingly (dropped when the clip ends before the cut).
 * Returns null when the cut would leave a part shorter than 200ms.
 */
export function splitSceneParts(scene: VideoScene, atMs: number): [VideoScene, VideoScene] | null {
  const t = Math.round(atMs)
  if (t < 200 || scene.durationMs - t < 200) return null
  const clip = scene.clip
  const first: VideoScene = {
    ...structuredClone(scene),
    durationMs: t,
    clip: clip
      ? { ...structuredClone(clip), outMs: Math.min(clip.outMs, clip.inMs + t) }
      : undefined
  }
  const secondClip =
    clip && clip.inMs + t < clip.outMs
      ? { ...structuredClone(clip), inMs: clip.inMs + t }
      : undefined
  const second: VideoScene = {
    ...structuredClone(scene),
    id: uuid(),
    name: `${scene.name} (2)`,
    durationMs: scene.durationMs - t,
    transitionIn: undefined,
    layers: structuredClone(scene.layers).map((l) => ({ ...l, id: uuid() })),
    clip: secondClip
  }
  return [first, second]
}

/** Sync the scenes array with the active scene's canvas/layers. */
function syncScenes(
  scenes: VideoScene[],
  activeSceneId: string,
  canvas: CanvasSpec,
  layers: Layer[]
): VideoScene[] {
  return scenes.map((s) =>
    s.id === activeSceneId ? { ...s, background: canvas.background, layers } : s
  )
}

function sceneCanvas(scene: VideoScene, width: number, height: number): CanvasSpec {
  return { width, height, background: scene.background }
}

function blankScene(name: string): VideoScene {
  return {
    id: uuid(),
    name,
    durationMs: DEFAULT_SCENE_MS,
    background: '#000000',
    clip: null,
    layers: []
  }
}

export const useVideoEditorStore = create<VideoEditorState>()(
  temporal(
    (set, get) => ({
      projectId: null,
      brandId: null,
      name: 'Untitled',
      width: 1080,
      height: 1920,

      scenes: [blankScene('Scene 1')],
      activeSceneId: '',

      canvas: { width: 1080, height: 1920, background: '#000000' },
      ...layerSliceInitialState,

      audio: null,

      playheadMs: 0,
      playing: false,

      // Shared layer/selection/alignment actions, wired to the `scenes` array.
      ...createLayerSlice<VideoEditorState>(set, get, (s, canvas, layers) => ({
        scenes: syncScenes(s.scenes, s.activeSceneId, canvas, layers)
      })),

      loadProject: (p) => {
        const scenes = p.scenes && p.scenes.length > 0 ? p.scenes : [blankScene('Scene 1')]
        const active = scenes[0]
        set({
          projectId: p.id,
          brandId: p.brandId,
          name: p.name,
          width: p.width,
          height: p.height,
          scenes,
          activeSceneId: active.id,
          canvas: sceneCanvas(active, p.width, p.height),
          layers: active.layers,
          audio: p.audio ?? null,
          selectedIds: [],
          cropMode: null,
          playheadMs: 0,
          playing: false
        })
      },

      setName: (name) => set({ name }),

      // ── Scenes ───────────────────────────────────────────────────────────

      setActiveScene: (id) =>
        set((s) => {
          const scene = s.scenes.find((p) => p.id === id)
          if (!scene) return {}
          return {
            activeSceneId: id,
            canvas: sceneCanvas(scene, s.width, s.height),
            layers: scene.layers,
            selectedIds: [],
            cropMode: null
          }
        }),

      addScene: (scene) =>
        set((s) => {
          const newScene: VideoScene = {
            ...blankScene(`Scene ${s.scenes.length + 1}`),
            ...scene,
            id: uuid()
          }
          const scenes = [...s.scenes, newScene]
          return {
            scenes,
            activeSceneId: newScene.id,
            canvas: sceneCanvas(newScene, s.width, s.height),
            layers: newScene.layers,
            selectedIds: []
          }
        }),

      deleteScene: (id) =>
        set((s) => {
          if (s.scenes.length <= 1) return {}
          const scenes = s.scenes.filter((p) => p.id !== id)
          if (s.activeSceneId !== id) return { scenes }
          const next = scenes[0]
          return {
            scenes,
            activeSceneId: next.id,
            canvas: sceneCanvas(next, s.width, s.height),
            layers: next.layers,
            selectedIds: []
          }
        }),

      duplicateScene: (id) =>
        set((s) => {
          const src = s.scenes.find((p) => p.id === id)
          if (!src) return {}
          const copy: VideoScene = {
            ...structuredClone(src),
            id: uuid(),
            name: `${src.name} copy`,
            layers: structuredClone(src.layers).map((l) => ({ ...l, id: uuid() }))
          }
          const idx = s.scenes.findIndex((p) => p.id === id)
          const scenes = [...s.scenes.slice(0, idx + 1), copy, ...s.scenes.slice(idx + 1)]
          return {
            scenes,
            activeSceneId: copy.id,
            canvas: sceneCanvas(copy, s.width, s.height),
            layers: copy.layers,
            selectedIds: []
          }
        }),

      renameScene: (id, name) =>
        set((s) => ({ scenes: s.scenes.map((p) => (p.id === id ? { ...p, name } : p)) })),

      setSceneDuration: (id, durationMs) =>
        set((s) => ({
          scenes: s.scenes.map((p) =>
            p.id === id ? { ...p, durationMs: Math.max(200, Math.round(durationMs)) } : p
          )
        })),

      splitSceneAtPlayhead: () =>
        set((s) => {
          const idx = s.scenes.findIndex((p) => p.id === s.activeSceneId)
          if (idx < 0) return {}
          // Fold any unsynced canvas/layer edits into the scene before cutting.
          const current = { ...s.scenes[idx], background: s.canvas.background, layers: s.layers }
          const parts = splitSceneParts(current, s.playheadMs)
          if (!parts) return {}
          const scenes = [...s.scenes.slice(0, idx), parts[0], parts[1], ...s.scenes.slice(idx + 1)]
          return {
            scenes,
            activeSceneId: parts[1].id,
            canvas: sceneCanvas(parts[1], s.width, s.height),
            layers: parts[1].layers,
            playheadMs: 0,
            selectedIds: []
          }
        }),

      reorderScene: (id, toIndex) =>
        set((s) => {
          const from = s.scenes.findIndex((p) => p.id === id)
          if (from < 0) return {}
          const scenes = [...s.scenes]
          const [item] = scenes.splice(from, 1)
          scenes.splice(Math.max(0, Math.min(scenes.length, toIndex)), 0, item)
          return { scenes }
        }),

      setSceneTransition: (id, type, durationMs = 500) =>
        set((s) => ({
          scenes: s.scenes.map((p) =>
            p.id === id ? { ...p, transitionIn: { type, durationMs } } : p
          )
        })),

      // ── Clip / audio ──────────────────────────────────────────────────────

      setSceneClip: (sceneId, clip) =>
        set((s) => {
          const scenes = s.scenes.map((p) => {
            if (p.id !== sceneId) return p
            // Auto-derive scene duration from the clip's trimmed length.
            const durationMs = clip ? Math.max(200, clip.outMs - clip.inMs) : p.durationMs
            return { ...p, clip, durationMs }
          })
          return { scenes }
        }),

      updateClip: (sceneId, patch) =>
        set((s) => ({
          scenes: s.scenes.map((p) =>
            p.id === sceneId && p.clip ? { ...p, clip: { ...p.clip, ...patch } } : p
          )
        })),

      setAudio: (audio) => set({ audio }),
      updateAudio: (patch) => set((s) => ({ audio: s.audio ? { ...s.audio, ...patch } : s.audio })),

      setPlayhead: (ms) => set({ playheadMs: Math.max(0, ms) }),
      setPlaying: (p) => set({ playing: p }),

      seekGlobal: (ms) =>
        set((s) => {
          let remaining = Math.max(0, ms)
          let target = s.scenes[0]
          for (const sc of s.scenes) {
            if (remaining < sc.durationMs || sc === s.scenes[s.scenes.length - 1]) {
              target = sc
              break
            }
            remaining -= sc.durationMs
          }
          const local = Math.max(0, Math.min(remaining, target.durationMs))
          if (target.id === s.activeSceneId) {
            return { playheadMs: local }
          }
          return {
            activeSceneId: target.id,
            canvas: sceneCanvas(target, s.width, s.height),
            layers: target.layers,
            selectedIds: [],
            cropMode: null,
            playheadMs: local
          }
        }),

      toProject: () => {
        const s = get()
        // Ensure the active scene reflects current canvas/layers before export/save.
        const scenes = syncScenes(s.scenes, s.activeSceneId, s.canvas, s.layers)
        return {
          id: s.projectId ?? '',
          brandId: s.brandId ?? '',
          name: s.name,
          width: s.width,
          height: s.height,
          scenes,
          audio: s.audio,
          thumbPath: null,
          createdAt: 0,
          updatedAt: 0
        }
      }
    }),
    {
      partialize: (state) => ({
        name: state.name,
        scenes: state.scenes,
        activeSceneId: state.activeSceneId,
        canvas: state.canvas,
        layers: state.layers,
        audio: state.audio
      }),
      limit: 100,
      handleSet: coalesceHistory(300)
    }
  )
)
