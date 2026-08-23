import { v4 as uuid } from 'uuid'
import type { CanvasSpec, Layer } from '@shared/types'

/**
 * Shared layer/selection/alignment logic for BOTH editors.
 *
 * The design store (`editorStore`, pages) and the video store
 * (`videoEditorStore`, scenes) used to carry near-identical copies of these
 * ~20 actions. The copies drifted, and the video one grew real bugs: alignment
 * that ignored rotation, alignment to the raw sheet edge instead of the safe
 * zone, and duplicates that joined the ORIGINAL group. Everything lives here
 * now, so a fix lands in both editors at once and the divergence cannot come
 * back silently.
 *
 * The only thing that differs between the two stores is HOW an edit is written
 * back to its container array (`pages` vs `scenes`); that is injected as the
 * `sync` callback.
 */

/** Fraction of each canvas edge treated as unsafe margin by `alignSelected`. */
export const SAFE_INSET = 0.05

/** State every consumer of this slice must provide. */
export interface LayerSliceState {
  canvas: CanvasSpec
  layers: Layer[]
  selectedIds: string[]
  cropMode: string | null
  clipboard: Layer[]
  zoom: number
  pan: { x: number; y: number }
  showGrid: boolean
  showSafe: boolean
  lockAspect: boolean
  guides: { x: number[]; y: number[] }
}

/** The actions this slice supplies. */
export interface LayerSliceActions {
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

  alignSelected: (
    mode: 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom',
    ref?: 'selection' | 'canvas'
  ) => void
  distributeSelected: (axis: 'horizontal' | 'vertical') => void
}

/** Initial values for the view/selection state this slice owns. */
export const layerSliceInitialState = {
  layers: [] as Layer[],
  selectedIds: [] as string[],
  zoom: 1,
  pan: { x: 0, y: 0 },
  showGrid: false,
  showSafe: false,
  gridSize: 40,
  cropMode: null as string | null,
  clipboard: [] as Layer[],
  lockAspect: false,
  guides: { x: [] as number[], y: [] as number[] }
}

/**
 * Copy layers for duplicate/paste.
 *
 * Duplicated members of a group get a NEW shared group, not the original —
 * otherwise selecting a copy would also select the layers it was copied from.
 */
export function clone(layers: Layer[], offset = 24): Layer[] {
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

/**
 * Writes the active container (page/scene) back into its array. Returns the
 * store-specific partial to merge — `{ pages }` for the design store,
 * `{ scenes }` for the video store.
 */
export type SyncContainers<S> = (state: S, canvas: CanvasSpec, layers: Layer[]) => Partial<S>

type SetState<S> = (partial: (state: S) => Partial<S>) => void
type GetState<S> = () => S

/**
 * Build the shared layer actions for a store.
 *
 * @param set  the store's `set` (updater form)
 * @param get  the store's `get`
 * @param sync writes canvas/layers back into the store's container array
 */
export function createLayerSlice<S extends LayerSliceState>(
  set: SetState<S>,
  get: GetState<S>,
  sync: SyncContainers<S>
): LayerSliceActions {
  /** Merge a layers change with the container write-back it implies. */
  const withLayers = (s: S, layers: Layer[], extra?: Partial<S>): Partial<S> =>
    ({ layers, ...sync(s, s.canvas, layers), ...extra }) as Partial<S>

  /** Set a plain patch that touches no layers. */
  const patch = (p: Partial<LayerSliceState>): Partial<S> => p as Partial<S>

  return {
    setCanvas: (c) =>
      set((s) => {
        const canvas = { ...s.canvas, ...c }
        return { canvas, ...sync(s, canvas, s.layers) } as Partial<S>
      }),

    addLayer: (layer) =>
      set((s) => withLayers(s, [...s.layers, layer], patch({ selectedIds: [layer.id] }))),

    updateLayer: (id, p) =>
      set((s) =>
        withLayers(
          s,
          s.layers.map((l) => (l.id === id ? { ...l, ...p } : l))
        )
      ),

    updateLayers: (patches) =>
      set((s) => {
        const byId = new Map(patches.map((p) => [p.id, p.patch]))
        const layers = s.layers.map((l) => {
          const p = byId.get(l.id)
          return p ? { ...l, ...p } : l
        })
        return withLayers(s, layers)
      }),

    removeLayer: (id) =>
      set((s) =>
        withLayers(
          s,
          s.layers.filter((l) => l.id !== id),
          patch({ selectedIds: s.selectedIds.filter((x) => x !== id) })
        )
      ),

    duplicateLayer: (id) => {
      const src = get().layers.find((l) => l.id === id)
      if (!src) return
      const [copy] = clone([src])
      set((s) => withLayers(s, [...s.layers, copy], patch({ selectedIds: [copy.id] })))
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
        return withLayers(s, layers)
      }),

    select: (id) =>
      set((s) => patch({ selectedIds: id ? expandToGroups([id], s.layers) : [], cropMode: null })),

    toggleSelect: (id) =>
      set((s) => {
        // Toggle the whole group when the layer belongs to one.
        const unit = expandToGroups([id], s.layers)
        const isOn = unit.every((u) => s.selectedIds.includes(u))
        return patch({
          selectedIds: isOn
            ? s.selectedIds.filter((x) => !unit.includes(x))
            : [...new Set([...s.selectedIds, ...unit])]
        })
      }),

    setSelection: (ids) => set((s) => patch({ selectedIds: expandToGroups(ids, s.layers) })),

    groupSelected: () =>
      set((s) => {
        if (s.selectedIds.length < 2) return {}
        const gid = uuid()
        return withLayers(
          s,
          s.layers.map((l) => (s.selectedIds.includes(l.id) ? { ...l, groupId: gid } : l))
        )
      }),

    ungroupSelected: () =>
      set((s) =>
        withLayers(
          s,
          s.layers.map((l) => (s.selectedIds.includes(l.id) ? { ...l, groupId: undefined } : l))
        )
      ),

    removeSelected: () =>
      set((s) =>
        withLayers(
          s,
          s.layers.filter((l) => !s.selectedIds.includes(l.id)),
          patch({ selectedIds: [] })
        )
      ),

    duplicateSelected: () => {
      const cur = get()
      const picked = cur.layers.filter((l) => cur.selectedIds.includes(l.id))
      if (picked.length === 0) return
      const copies = clone(picked)
      set((s) =>
        withLayers(s, [...s.layers, ...copies], patch({ selectedIds: copies.map((c) => c.id) }))
      )
    },

    nudgeSelected: (dx, dy) =>
      set((s) =>
        withLayers(
          s,
          s.layers.map((l) =>
            s.selectedIds.includes(l.id) ? { ...l, x: l.x + dx, y: l.y + dy } : l
          )
        )
      ),

    copySelected: () => {
      const s = get()
      const picked = s.layers.filter((l) => s.selectedIds.includes(l.id))
      if (picked.length) set(() => patch({ clipboard: picked.map((l) => structuredClone(l)) }))
    },

    paste: () => {
      const { clipboard } = get()
      if (clipboard.length === 0) return
      const copies = clone(clipboard)
      set((s) =>
        withLayers(s, [...s.layers, ...copies], patch({ selectedIds: copies.map((c) => c.id) }))
      )
    },

    setCropMode: (cropMode) => set(() => patch({ cropMode })),
    setZoom: (zoom) => set(() => patch({ zoom })),
    setPan: (pan) => set(() => patch({ pan })),
    toggleGrid: () => set((s) => patch({ showGrid: !s.showGrid })),
    toggleSafe: () => set((s) => patch({ showSafe: !s.showSafe })),
    toggleLockAspect: () => set((s) => patch({ lockAspect: !s.lockAspect })),
    addGuide: (axis, pos) =>
      set((s) => patch({ guides: { ...s.guides, [axis]: [...s.guides[axis], Math.round(pos)] } })),
    removeGuide: (axis, index) =>
      set((s) =>
        patch({ guides: { ...s.guides, [axis]: s.guides[axis].filter((_, i) => i !== index) } })
      ),
    clearGuides: () => set(() => patch({ guides: { x: [], y: [] } })),

    // ── Alignment ──────────────────────────────────────────────────────────

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
        // aligned objects never touch the margin — on a 1080x1920 reel that
        // margin is exactly the strip social platforms crop into.
        const insetX = s.canvas.width * SAFE_INSET
        const insetY = s.canvas.height * SAFE_INSET
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
        return withLayers(s, layers)
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
        return withLayers(s, layers)
      })
  }
}
