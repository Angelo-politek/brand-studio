import { create } from 'zustand'
import { temporal } from 'zundo'
import { v4 as uuid } from 'uuid'
import type { CanvasSpec, Layer, Page, Project } from '@shared/types'

interface EditorState {
  projectId: string | null
  brandId: string | null
  name: string
  type: string
  createdAt: number

  // Multi-page state
  pages: Page[]
  activePageId: string

  // Mirrors of the active page (kept in sync — existing editor code reads these).
  canvas: CanvasSpec
  layers: Layer[]

  selectedIds: string[]

  // view / interaction state (excluded from undo history)
  zoom: number
  pan: { x: number; y: number }
  showGrid: boolean
  showSafe: boolean
  gridSize: number
  cropMode: string | null
  clipboard: Layer[]
  /** Constrain resize to the current aspect ratio (Transformer keepRatio). */
  lockAspect: boolean
  /** User guides in canvas coords, per axis (session only, not persisted). */
  guides: { x: number[]; y: number[] }

  loadProject: (p: Project) => void
  setName: (name: string) => void
  setCanvas: (c: Partial<CanvasSpec>) => void
  addLayer: (layer: Layer) => void
  updateLayer: (id: string, patch: Partial<Layer>) => void
  /** Patch several layers in ONE set() — one undo step for the whole gesture. */
  updateLayers: (patches: { id: string; patch: Partial<Layer> }[]) => void
  removeLayer: (id: string) => void
  duplicateLayer: (id: string) => void
  moveLayer: (id: string, dir: 'up' | 'down' | 'top' | 'bottom') => void

  select: (id: string | null) => void
  toggleSelect: (id: string) => void
  setSelection: (ids: string[]) => void
  /** Assign a shared groupId to the current multi-selection. */
  groupSelected: () => void
  /** Remove group membership from the selected layers. */
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
  toggleLockAspect: () => void
  addGuide: (axis: 'x' | 'y', pos: number) => void
  removeGuide: (axis: 'x' | 'y', index: number) => void
  clearGuides: () => void

  // Alignment
  alignSelected: (
    mode: 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom',
    ref?: 'selection' | 'canvas'
  ) => void
  distributeSelected: (axis: 'horizontal' | 'vertical') => void

  // Page management
  setActivePage: (id: string) => void
  addPage: () => void
  deletePage: (id: string) => void
  duplicatePage: (id: string) => void
  renamePage: (id: string, name: string) => void
  reorderPage: (id: string, toIndex: number) => void
}

function clone(layers: Layer[], offset = 24): Layer[] {
  // Duplicated members of a group get a NEW shared group, not the original.
  const groupMap = new Map<string, string>()
  return layers.map((l) => {
    let groupId = l.groupId
    if (groupId) {
      if (!groupMap.has(groupId)) groupMap.set(groupId, uuid())
      groupId = groupMap.get(groupId)
    }
    return {
      ...structuredClone(l),
      id: uuid(),
      groupId,
      name: `${l.name} copy`,
      x: l.x + offset,
      y: l.y + offset
    }
  })
}

/**
 * Axis-aligned bounding box of a layer INCLUDING rotation (and negative
 * scales/flips): the AABB of the four rotated corners around the node origin.
 * Alignment/distribution use this so rotated layers line up by what you see.
 */
export function layerAabb(l: Layer): { x: number; y: number; w: number; h: number } {
  const w = l.width * l.scaleX
  const h = l.height * l.scaleY
  const rad = ((l.rotation || 0) * Math.PI) / 180
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  const corners: [number, number][] = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h]
  ]
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [px, py] of corners) {
    const x = l.x + px * c - py * s
    const y = l.y + px * s + py * c
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/**
 * Expand a selection so that picking any member of a group selects the whole
 * group (flat groupId model).
 */
export function expandToGroups(ids: string[], layers: Layer[]): string[] {
  const groups = new Set<string>()
  for (const l of layers) if (l.groupId && ids.includes(l.id)) groups.add(l.groupId)
  if (groups.size === 0) return ids
  const out = new Set(ids)
  for (const l of layers) if (l.groupId && groups.has(l.groupId)) out.add(l.id)
  return [...out]
}

/** Sync pages array with current layers/canvas for the active page. */
function syncPages(
  pages: Page[],
  activePageId: string,
  canvas: CanvasSpec,
  layers: Layer[]
): Page[] {
  return pages.map((p) => (p.id === activePageId ? { ...p, canvas, layers } : p))
}

const DEFAULT_CANVAS: CanvasSpec = { width: 1080, height: 1080, background: '#ffffff' }

// Discrete, meaningful edits (remove-bg, palette match, apply-brand) set this
// so the very next history write is NOT coalesced away — each becomes its own
// undo step, so Ctrl+Z walks back through them to the original.
let forceNextHistory = false

/** Force the next store mutation to record a distinct undo checkpoint. */
export function checkpointHistory(): void {
  forceNextHistory = true
}

/**
 * Leading-edge throttle for zundo's history writes: a burst of set() calls
 * (slider drags, filter tweaks) records ONE entry — the state before the burst
 * — so a single Ctrl+Z reverts the whole gesture and the 100-entry stack isn't
 * flooded (which used to evict real edits and make undo look broken).
 *
 * `checkpointHistory()` bypasses the throttle for the next write so important
 * one-shot operations always land as their own undo step.
 */
export function coalesceHistory<T>(
  windowMs: number
): (fn: (state: T) => void) => (state: T) => void {
  return (handle) => {
    let last = 0
    return (state) => {
      const now = Date.now()
      if (forceNextHistory || now - last > windowMs) {
        forceNextHistory = false
        last = now
        handle(state)
      }
    }
  }
}

export const useEditorStore = create<EditorState>()(
  temporal(
    (set, get) => ({
      projectId: null,
      brandId: null,
      name: 'Untitled',
      type: 'custom',
      createdAt: Date.now(),

      pages: [{ id: uuid(), name: 'Page 1', canvas: DEFAULT_CANVAS, layers: [] }],
      activePageId: '',

      canvas: DEFAULT_CANVAS,
      layers: [],
      selectedIds: [],

      zoom: 1,
      pan: { x: 0, y: 0 },
      showGrid: false,
      showSafe: false,
      gridSize: 40,
      cropMode: null,
      clipboard: [],
      lockAspect: false,
      guides: { x: [], y: [] },

      loadProject: (p) => {
        const pages: Page[] =
          p.pages && p.pages.length > 0
            ? p.pages
            : [{ id: uuid(), name: 'Page 1', canvas: p.canvas, layers: p.layers }]
        const activePage = pages[0]
        set({
          projectId: p.id,
          brandId: p.brandId,
          name: p.name,
          type: p.type,
          createdAt: p.createdAt,
          pages,
          activePageId: activePage.id,
          canvas: activePage.canvas,
          layers: activePage.layers,
          selectedIds: [],
          cropMode: null
        })
      },

      setName: (name) => set({ name }),

      setCanvas: (c) =>
        set((s) => {
          const canvas = { ...s.canvas, ...c }
          return { canvas, pages: syncPages(s.pages, s.activePageId, canvas, s.layers) }
        }),

      addLayer: (layer) =>
        set((s) => {
          const layers = [...s.layers, layer]
          return {
            layers,
            selectedIds: [layer.id],
            pages: syncPages(s.pages, s.activePageId, s.canvas, layers)
          }
        }),

      updateLayer: (id, patch) =>
        set((s) => {
          const layers = s.layers.map((l) => (l.id === id ? { ...l, ...patch } : l))
          return { layers, pages: syncPages(s.pages, s.activePageId, s.canvas, layers) }
        }),

      updateLayers: (patches) =>
        set((s) => {
          const byId = new Map(patches.map((p) => [p.id, p.patch]))
          const layers = s.layers.map((l) => {
            const patch = byId.get(l.id)
            return patch ? { ...l, ...patch } : l
          })
          return { layers, pages: syncPages(s.pages, s.activePageId, s.canvas, layers) }
        }),

      removeLayer: (id) =>
        set((s) => {
          const layers = s.layers.filter((l) => l.id !== id)
          return {
            layers,
            selectedIds: s.selectedIds.filter((x) => x !== id),
            pages: syncPages(s.pages, s.activePageId, s.canvas, layers)
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
            pages: syncPages(s.pages, s.activePageId, s.canvas, layers)
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
          return { layers, pages: syncPages(s.pages, s.activePageId, s.canvas, layers) }
        }),

      select: (id) =>
        set((s) => ({
          selectedIds: id ? expandToGroups([id], s.layers) : [],
          cropMode: null
        })),
      toggleSelect: (id) =>
        set((s) => {
          // Toggle the whole group when the layer belongs to one.
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
          return { layers, pages: syncPages(s.pages, s.activePageId, s.canvas, layers) }
        }),

      ungroupSelected: () =>
        set((s) => {
          const layers = s.layers.map((l) =>
            s.selectedIds.includes(l.id) ? { ...l, groupId: undefined } : l
          )
          return { layers, pages: syncPages(s.pages, s.activePageId, s.canvas, layers) }
        }),

      removeSelected: () =>
        set((s) => {
          const layers = s.layers.filter((l) => !s.selectedIds.includes(l.id))
          return {
            layers,
            selectedIds: [],
            pages: syncPages(s.pages, s.activePageId, s.canvas, layers)
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
            pages: syncPages(st.pages, st.activePageId, st.canvas, layers)
          }
        })
      },

      nudgeSelected: (dx, dy) =>
        set((s) => {
          const layers = s.layers.map((l) =>
            s.selectedIds.includes(l.id) ? { ...l, x: l.x + dx, y: l.y + dy } : l
          )
          return { layers, pages: syncPages(s.pages, s.activePageId, s.canvas, layers) }
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
            pages: syncPages(s.pages, s.activePageId, s.canvas, layers)
          }
        })
      },

      setCropMode: (cropMode) => set({ cropMode }),
      setZoom: (zoom) => set({ zoom }),
      setPan: (pan) => set({ pan }),
      toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
      toggleSafe: () => set((s) => ({ showSafe: !s.showSafe })),
      toggleLockAspect: () => set((s) => ({ lockAspect: !s.lockAspect })),
      addGuide: (axis, pos) =>
        set((s) => ({ guides: { ...s.guides, [axis]: [...s.guides[axis], Math.round(pos)] } })),
      removeGuide: (axis, index) =>
        set((s) => ({
          guides: { ...s.guides, [axis]: s.guides[axis].filter((_, i) => i !== index) }
        })),
      clearGuides: () => set({ guides: { x: [], y: [] } }),

      // ── Alignment ────────────────────────────────────────────────────────

      alignSelected: (mode, ref) =>
        set((s) => {
          const sel = s.layers.filter((l) => s.selectedIds.includes(l.id))
          if (sel.length === 0) return {}
          // A single object has nothing to align against within the selection,
          // so default to aligning it to the canvas (matches Canva/Figma).
          ref = ref ?? (sel.length === 1 ? 'canvas' : 'selection')
          // Rotation-aware boxes: align what the user SEES, not the unrotated frame.
          const bbs = new Map(sel.map((l) => [l.id, layerAabb(l)]))
          const boxes = [...bbs.values()]
          // Align to the SAFE ZONE (5% inset) rather than the raw sheet edge, so
          // aligned objects never touch the margin.
          const insetX = s.canvas.width * 0.05
          const insetY = s.canvas.height * 0.05
          const refL = ref === 'canvas' ? insetX : Math.min(...boxes.map((b) => b.x))
          const refR =
            ref === 'canvas' ? s.canvas.width - insetX : Math.max(...boxes.map((b) => b.x + b.w))
          const refT = ref === 'canvas' ? insetY : Math.min(...boxes.map((b) => b.y))
          const refB =
            ref === 'canvas' ? s.canvas.height - insetY : Math.max(...boxes.map((b) => b.y + b.h))
          const refCX = (refL + refR) / 2
          const refCY = (refT + refB) / 2
          const layers = s.layers.map((l) => {
            if (!s.selectedIds.includes(l.id)) return l
            const bb = bbs.get(l.id)!
            // Move by the delta between the target edge and the AABB edge, so
            // rotated/flipped layers land exactly on the reference line.
            switch (mode) {
              case 'left':
                return { ...l, x: l.x + (refL - bb.x) }
              case 'right':
                return { ...l, x: l.x + (refR - (bb.x + bb.w)) }
              case 'centerX':
                return { ...l, x: l.x + (refCX - (bb.x + bb.w / 2)) }
              case 'top':
                return { ...l, y: l.y + (refT - bb.y) }
              case 'bottom':
                return { ...l, y: l.y + (refB - (bb.y + bb.h)) }
              case 'centerY':
                return { ...l, y: l.y + (refCY - (bb.y + bb.h / 2)) }
              default:
                return l
            }
          })
          return { layers, pages: syncPages(s.pages, s.activePageId, s.canvas, layers) }
        }),

      distributeSelected: (axis) =>
        set((s) => {
          const sel = s.layers.filter((l) => s.selectedIds.includes(l.id))
          if (sel.length < 3) return {}
          const bbs = new Map(sel.map((l) => [l.id, layerAabb(l)]))
          const at = (l: Layer): number =>
            axis === 'horizontal' ? bbs.get(l.id)!.x : bbs.get(l.id)!.y
          const size = (l: Layer): number =>
            axis === 'horizontal' ? bbs.get(l.id)!.w : bbs.get(l.id)!.h
          const sorted = [...sel].sort((a, b) => at(a) - at(b))
          const first = sorted[0]
          const last = sorted[sorted.length - 1]
          const totalSpan = at(last) + size(last) - at(first)
          const totalSize = sorted.reduce((sum, l) => sum + size(l), 0)
          const gap = (totalSpan - totalSize) / (sorted.length - 1)
          let cursor = at(first)
          // Target AABB position per layer → applied as a delta on x/y.
          const deltas = new Map<string, number>()
          for (const l of sorted) {
            deltas.set(l.id, cursor - at(l))
            cursor += size(l) + gap
          }
          const layers = s.layers.map((l) => {
            const d = deltas.get(l.id)
            if (d === undefined) return l
            return axis === 'horizontal' ? { ...l, x: l.x + d } : { ...l, y: l.y + d }
          })
          return { layers, pages: syncPages(s.pages, s.activePageId, s.canvas, layers) }
        }),

      // ── Page management ──────────────────────────────────────────────────

      setActivePage: (id) =>
        set((s) => {
          const page = s.pages.find((p) => p.id === id)
          if (!page) return {}
          return { activePageId: id, canvas: page.canvas, layers: page.layers, selectedIds: [] }
        }),

      addPage: () =>
        set((s) => {
          const firstCanvas = s.pages[0]?.canvas ?? DEFAULT_CANVAS
          const newPage: Page = {
            id: uuid(),
            name: `Page ${s.pages.length + 1}`,
            canvas: { ...firstCanvas },
            layers: []
          }
          const pages = [...s.pages, newPage]
          return {
            pages,
            activePageId: newPage.id,
            canvas: newPage.canvas,
            layers: newPage.layers,
            selectedIds: []
          }
        }),

      deletePage: (id) =>
        set((s) => {
          if (s.pages.length <= 1) return {} // cannot delete last page
          const pages = s.pages.filter((p) => p.id !== id)
          if (s.activePageId !== id) return { pages }
          const newActive = pages[0]
          return {
            pages,
            activePageId: newActive.id,
            canvas: newActive.canvas,
            layers: newActive.layers,
            selectedIds: []
          }
        }),

      duplicatePage: (id) =>
        set((s) => {
          const src = s.pages.find((p) => p.id === id)
          if (!src) return {}
          const copy: Page = {
            id: uuid(),
            name: `${src.name} copy`,
            canvas: structuredClone(src.canvas),
            layers: structuredClone(src.layers).map((l) => ({ ...l, id: uuid() }))
          }
          const idx = s.pages.findIndex((p) => p.id === id)
          const pages = [...s.pages.slice(0, idx + 1), copy, ...s.pages.slice(idx + 1)]
          return {
            pages,
            activePageId: copy.id,
            canvas: copy.canvas,
            layers: copy.layers,
            selectedIds: []
          }
        }),

      renamePage: (id, name) =>
        set((s) => ({ pages: s.pages.map((p) => (p.id === id ? { ...p, name } : p)) })),

      reorderPage: (id, toIndex) =>
        set((s) => {
          const from = s.pages.findIndex((p) => p.id === id)
          if (from < 0) return {}
          const pages = [...s.pages]
          const [item] = pages.splice(from, 1)
          pages.splice(Math.max(0, Math.min(pages.length, toIndex)), 0, item)
          return { pages }
        })
    }),
    {
      partialize: (state) => ({
        name: state.name,
        canvas: state.canvas,
        layers: state.layers,
        pages: state.pages,
        activePageId: state.activePageId
      }),
      limit: 100,
      handleSet: coalesceHistory(300)
    }
  )
)
