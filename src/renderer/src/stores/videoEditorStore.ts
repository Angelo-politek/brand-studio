import { create } from 'zustand'
import { temporal } from 'zundo'
import { v4 as uuid } from 'uuid'
import { coalesceHistory, expandToGroups } from './editorStore'
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
 * Editor store for the timeline video editor. Mirrors the design `editorStore`
 * surface (canvas, layers, selectedIds + layer/select/crop actions) so the
 * shared canvas components work unchanged, and adds scene/clip/audio/playhead
 * state for the timeline.
 *
 * `canvas` and `layers` mirror the ACTIVE scene; edits sync back into
 * `scenes` via `syncScenes`.
 */
interface VideoEditorState {
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
  selectedIds: string[]

  // Global background music.
  audio: AudioTrack | null

  // Playback / view (excluded from undo history).
  playheadMs: number
  playing: boolean
  zoom: number
  pan: { x: number; y: number }
  showGrid: boolean
  showSafe: boolean
  gridSize: number
  cropMode: string | null
  clipboard: Layer[]

  loadProject: (p: VideoProject) => void
  setName: (name: string) => void

  // Shared canvas surface (same names as editorStore)
  setCanvas: (c: Partial<CanvasSpec>) => void
  addLayer: (layer: Layer) => void
  updateLayer: (id: string, patch: Partial<Layer>) => void
  updateLayers: (patches: { id: string; patch: Partial<Layer> }[]) => void
  removeLayer: (id: string) => void
  duplicateLayer: (id: string) => void
  moveLayer: (id: string, dir: 'up' | 'down' | 'top' | 'bottom') => void
  select: (id: string | null) => void
  toggleSelect: (id: string) => void
  setSelection: (ids: string[]) => void
  groupSelected: () => void
  ungroupSelected: () => void
  removeSelected: () => void
  duplicateSelected: () => void
  nudgeSelected: (dx: number, dy: number) => void
  copySelected: () => void
  paste: () => void
  setCropMode: (id: string | null) => void
  setZoom: (zoom: number) => void
  setPan: (pan: { x: number; y: number }) => void
  toggleGrid: () => void
  toggleSafe: () => void
  alignSelected: (
    mode: 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom',
    ref?: 'selection' | 'canvas'
  ) => void
  distributeSelected: (axis: 'horizontal' | 'vertical') => void

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

function clone(layers: Layer[], offset = 24): Layer[] {
  return layers.map((l) => ({
    ...structuredClone(l),
    id: uuid(),
    name: `${l.name} copy`,
    x: l.x + offset,
    y: l.y + offset
  }))
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
      layers: [],
      selectedIds: [],

      audio: null,

      playheadMs: 0,
      playing: false,
      zoom: 1,
      pan: { x: 0, y: 0 },
      showGrid: false,
      showSafe: false,
      gridSize: 40,
      cropMode: null,
      clipboard: [],

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

      setCanvas: (c) =>
        set((s) => {
          const canvas = { ...s.canvas, ...c }
          return { canvas, scenes: syncScenes(s.scenes, s.activeSceneId, canvas, s.layers) }
        }),

      addLayer: (layer) =>
        set((s) => {
          const layers = [...s.layers, layer]
          return {
            layers,
            selectedIds: [layer.id],
            scenes: syncScenes(s.scenes, s.activeSceneId, s.canvas, layers)
          }
        }),

      updateLayer: (id, patch) =>
        set((s) => {
          const layers = s.layers.map((l) => (l.id === id ? { ...l, ...patch } : l))
          return { layers, scenes: syncScenes(s.scenes, s.activeSceneId, s.canvas, layers) }
        }),

      updateLayers: (patches) =>
        set((s) => {
          const byId = new Map(patches.map((p) => [p.id, p.patch]))
          const layers = s.layers.map((l) => {
            const patch = byId.get(l.id)
            return patch ? { ...l, ...patch } : l
          })
          return { layers, scenes: syncScenes(s.scenes, s.activeSceneId, s.canvas, layers) }
        }),

      removeLayer: (id) =>
        set((s) => {
          const layers = s.layers.filter((l) => l.id !== id)
          return {
            layers,
            selectedIds: s.selectedIds.filter((x) => x !== id),
            scenes: syncScenes(s.scenes, s.activeSceneId, s.canvas, layers)
          }
        }),

      duplicateLayer: (id) => {
        const src = get().layers.find((l) => l.id === id)
        if (!src) return
        const [copy] = clone([src])
        set((s) => {
          const layers = [...s.layers, copy]
          return {
            layers,
            selectedIds: [copy.id],
            scenes: syncScenes(s.scenes, s.activeSceneId, s.canvas, layers)
          }
        })
      },

      moveLayer: (id, dir) =>
        set((s) => {
          const layers = [...s.layers]
          const i = layers.findIndex((l) => l.id === id)
          if (i < 0) return {}
          const [item] = layers.splice(i, 1)
          if (dir === 'top') layers.push(item)
          else if (dir === 'bottom') layers.unshift(item)
          else if (dir === 'up') layers.splice(Math.min(layers.length, i + 1), 0, item)
          else layers.splice(Math.max(0, i - 1), 0, item)
          return { layers, scenes: syncScenes(s.scenes, s.activeSceneId, s.canvas, layers) }
        }),

      select: (id) =>
        set((s) => ({
          selectedIds: id ? expandToGroups([id], s.layers) : [],
          cropMode: null
        })),
      toggleSelect: (id) =>
        set((s) => {
          const unit = expandToGroups([id], s.layers)
          const isOn = unit.every((u) => s.selectedIds.includes(u))
          return {
            selectedIds: isOn
              ? s.selectedIds.filter((x) => !unit.includes(x))
              : [...new Set([...s.selectedIds, ...unit])]
          }
        }),
      setSelection: (ids) => set((s) => ({ selectedIds: expandToGroups(ids, s.layers) })),

      groupSelected: () =>
        set((s) => {
          if (s.selectedIds.length < 2) return {}
          const gid = uuid()
          const layers = s.layers.map((l) =>
            s.selectedIds.includes(l.id) ? { ...l, groupId: gid } : l
          )
          return { layers, scenes: syncScenes(s.scenes, s.activeSceneId, s.canvas, layers) }
        }),

      ungroupSelected: () =>
        set((s) => {
          const layers = s.layers.map((l) =>
            s.selectedIds.includes(l.id) ? { ...l, groupId: undefined } : l
          )
          return { layers, scenes: syncScenes(s.scenes, s.activeSceneId, s.canvas, layers) }
        }),

      removeSelected: () =>
        set((s) => {
          const layers = s.layers.filter((l) => !s.selectedIds.includes(l.id))
          return {
            layers,
            selectedIds: [],
            scenes: syncScenes(s.scenes, s.activeSceneId, s.canvas, layers)
          }
        }),

      duplicateSelected: () => {
        const s = get()
        const picked = s.layers.filter((l) => s.selectedIds.includes(l.id))
        if (picked.length === 0) return
        const copies = clone(picked)
        set((st) => {
          const layers = [...st.layers, ...copies]
          return {
            layers,
            selectedIds: copies.map((c) => c.id),
            scenes: syncScenes(st.scenes, st.activeSceneId, st.canvas, layers)
          }
        })
      },

      nudgeSelected: (dx, dy) =>
        set((s) => {
          const layers = s.layers.map((l) =>
            s.selectedIds.includes(l.id) ? { ...l, x: l.x + dx, y: l.y + dy } : l
          )
          return { layers, scenes: syncScenes(s.scenes, s.activeSceneId, s.canvas, layers) }
        }),

      copySelected: () => {
        const s = get()
        const picked = s.layers.filter((l) => s.selectedIds.includes(l.id))
        if (picked.length) set({ clipboard: picked.map((l) => structuredClone(l)) })
      },

      paste: () => {
        const { clipboard } = get()
        if (clipboard.length === 0) return
        const copies = clone(clipboard)
        set((s) => {
          const layers = [...s.layers, ...copies]
          return {
            layers,
            selectedIds: copies.map((c) => c.id),
            scenes: syncScenes(s.scenes, s.activeSceneId, s.canvas, layers)
          }
        })
      },

      setCropMode: (cropMode) => set({ cropMode }),
      setZoom: (zoom) => set({ zoom }),
      setPan: (pan) => set({ pan }),
      toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
      toggleSafe: () => set((s) => ({ showSafe: !s.showSafe })),

      alignSelected: (mode, ref) =>
        set((s) => {
          const sel = s.layers.filter((l) => s.selectedIds.includes(l.id))
          if (sel.length === 0) return {}
          ref = ref ?? (sel.length === 1 ? 'canvas' : 'selection')
          const bbs = sel.map((l) => ({
            id: l.id,
            l: l.x,
            r: l.x + l.width * l.scaleX,
            t: l.y,
            b: l.y + l.height * l.scaleY
          }))
          const refL = ref === 'canvas' ? 0 : Math.min(...bbs.map((b) => b.l))
          const refR = ref === 'canvas' ? s.canvas.width : Math.max(...bbs.map((b) => b.r))
          const refT = ref === 'canvas' ? 0 : Math.min(...bbs.map((b) => b.t))
          const refB = ref === 'canvas' ? s.canvas.height : Math.max(...bbs.map((b) => b.b))
          const refCX = (refL + refR) / 2
          const refCY = (refT + refB) / 2
          const layers = s.layers.map((l) => {
            if (!s.selectedIds.includes(l.id)) return l
            const w = l.width * l.scaleX
            const h = l.height * l.scaleY
            switch (mode) {
              case 'left':
                return { ...l, x: refL }
              case 'right':
                return { ...l, x: refR - w }
              case 'centerX':
                return { ...l, x: refCX - w / 2 }
              case 'top':
                return { ...l, y: refT }
              case 'bottom':
                return { ...l, y: refB - h }
              case 'centerY':
                return { ...l, y: refCY - h / 2 }
              default:
                return l
            }
          })
          return { layers, scenes: syncScenes(s.scenes, s.activeSceneId, s.canvas, layers) }
        }),

      distributeSelected: (axis) =>
        set((s) => {
          const sel = s.layers.filter((l) => s.selectedIds.includes(l.id))
          if (sel.length < 3) return {}
          const sorted = [...sel].sort((a, b) => (axis === 'horizontal' ? a.x - b.x : a.y - b.y))
          const first = sorted[0]
          const last = sorted[sorted.length - 1]
          const totalSpan =
            axis === 'horizontal'
              ? last.x + last.width * last.scaleX - first.x
              : last.y + last.height * last.scaleY - first.y
          const totalSize = sorted.reduce(
            (sum, l) => sum + (axis === 'horizontal' ? l.width * l.scaleX : l.height * l.scaleY),
            0
          )
          const gap = (totalSpan - totalSize) / (sorted.length - 1)
          let cursor = axis === 'horizontal' ? first.x : first.y
          const positions = new Map<string, number>()
          for (const l of sorted) {
            positions.set(l.id, cursor)
            cursor += (axis === 'horizontal' ? l.width * l.scaleX : l.height * l.scaleY) + gap
          }
          const layers = s.layers.map((l) => {
            const pos = positions.get(l.id)
            if (pos === undefined) return l
            return axis === 'horizontal' ? { ...l, x: pos } : { ...l, y: pos }
          })
          return { layers, scenes: syncScenes(s.scenes, s.activeSceneId, s.canvas, layers) }
        }),

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
