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

  loadProject: (p: Project) => void
  setName: (name: string) => void
  setCanvas: (c: Partial<CanvasSpec>) => void
  addLayer: (layer: Layer) => void
  updateLayer: (id: string, patch: Partial<Layer>) => void
  removeLayer: (id: string) => void
  duplicateLayer: (id: string) => void
  moveLayer: (id: string, dir: 'up' | 'down' | 'top' | 'bottom') => void

  select: (id: string | null) => void
  toggleSelect: (id: string) => void
  setSelection: (ids: string[]) => void
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

  // Alignment
  alignSelected: (mode: 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom', ref?: 'selection' | 'canvas') => void
  distributeSelected: (axis: 'horizontal' | 'vertical') => void

  // Page management
  setActivePage: (id: string) => void
  addPage: () => void
  deletePage: (id: string) => void
  duplicatePage: (id: string) => void
  renamePage: (id: string, name: string) => void
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

/** Sync pages array with current layers/canvas for the active page. */
function syncPages(pages: Page[], activePageId: string, canvas: CanvasSpec, layers: Layer[]): Page[] {
  return pages.map((p) => (p.id === activePageId ? { ...p, canvas, layers } : p))
}

const DEFAULT_CANVAS: CanvasSpec = { width: 1080, height: 1080, background: '#ffffff' }

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

      loadProject: (p) => {
        const pages: Page[] = p.pages && p.pages.length > 0
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
          return { layers, selectedIds: [layer.id], pages: syncPages(s.pages, s.activePageId, s.canvas, layers) }
        }),

      updateLayer: (id, patch) =>
        set((s) => {
          const layers = s.layers.map((l) => (l.id === id ? { ...l, ...patch } : l))
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
          return { layers, selectedIds: [copy.id], pages: syncPages(s.pages, s.activePageId, s.canvas, layers) }
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

      select: (id) => set({ selectedIds: id ? [id] : [], cropMode: null }),
      toggleSelect: (id) =>
        set((s) => ({
          selectedIds: s.selectedIds.includes(id)
            ? s.selectedIds.filter((x) => x !== id)
            : [...s.selectedIds, id]
        })),
      setSelection: (ids) => set({ selectedIds: ids }),

      removeSelected: () =>
        set((s) => {
          const layers = s.layers.filter((l) => !s.selectedIds.includes(l.id))
          return { layers, selectedIds: [], pages: syncPages(s.pages, s.activePageId, s.canvas, layers) }
        }),

      duplicateSelected: () => {
        const s = get()
        const picked = s.layers.filter((l) => s.selectedIds.includes(l.id))
        if (picked.length === 0) return
        const copies = clone(picked)
        set((st) => {
          const layers = [...st.layers, ...copies]
          return { layers, selectedIds: copies.map((c) => c.id), pages: syncPages(st.pages, st.activePageId, st.canvas, layers) }
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
          return { layers, selectedIds: copies.map((c) => c.id), pages: syncPages(s.pages, s.activePageId, s.canvas, layers) }
        })
      },

      setCropMode: (cropMode) => set({ cropMode }),
      setZoom: (zoom) => set({ zoom }),
      setPan: (pan) => set({ pan }),
      toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
      toggleSafe: () => set((s) => ({ showSafe: !s.showSafe })),

      // ── Alignment ────────────────────────────────────────────────────────

      alignSelected: (mode, ref) =>
        set((s) => {
          const sel = s.layers.filter((l) => s.selectedIds.includes(l.id))
          if (sel.length === 0) return {}
          // A single object has nothing to align against within the selection,
          // so default to aligning it to the canvas (matches Canva/Figma).
          ref = ref ?? (sel.length === 1 ? 'canvas' : 'selection')
          const bbs = sel.map((l) => ({
            id: l.id,
            l: l.x,
            r: l.x + l.width * l.scaleX,
            t: l.y,
            b: l.y + l.height * l.scaleY,
            cx: l.x + (l.width * l.scaleX) / 2,
            cy: l.y + (l.height * l.scaleY) / 2
          }))
          const refL = ref === 'canvas' ? 0 : Math.min(...bbs.map((b) => b.l))
          const refR = ref === 'canvas' ? s.canvas.width : Math.max(...bbs.map((b) => b.r))
          const refT = ref === 'canvas' ? 0 : Math.min(...bbs.map((b) => b.t))
          const refB = ref === 'canvas' ? s.canvas.height : Math.max(...bbs.map((b) => b.b))
          const refCX = (refL + refR) / 2
          const refCY = (refT + refB) / 2
          const layers = s.layers.map((l) => {
            if (!s.selectedIds.includes(l.id)) return l
            const bb = bbs.find((b) => b.id === l.id)!
            const w = l.width * l.scaleX
            const h = l.height * l.scaleY
            switch (mode) {
              case 'left':    return { ...l, x: refL }
              case 'right':   return { ...l, x: refR - w }
              case 'centerX': return { ...l, x: refCX - w / 2 }
              case 'top':     return { ...l, y: refT }
              case 'bottom':  return { ...l, y: refB - h }
              case 'centerY': return { ...l, y: refCY - h / 2 }
              default: return l
            }
            void bb
          })
          return { layers, pages: syncPages(s.pages, s.activePageId, s.canvas, layers) }
        }),

      distributeSelected: (axis) =>
        set((s) => {
          const sel = s.layers.filter((l) => s.selectedIds.includes(l.id))
          if (sel.length < 3) return {}
          const sorted = [...sel].sort((a, b) =>
            axis === 'horizontal' ? a.x - b.x : a.y - b.y
          )
          const first = sorted[0]
          const last = sorted[sorted.length - 1]
          const totalSpan = axis === 'horizontal'
            ? (last.x + last.width * last.scaleX) - first.x
            : (last.y + last.height * last.scaleY) - first.y
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
          return { pages, activePageId: newPage.id, canvas: newPage.canvas, layers: newPage.layers, selectedIds: [] }
        }),

      deletePage: (id) =>
        set((s) => {
          if (s.pages.length <= 1) return {} // cannot delete last page
          const pages = s.pages.filter((p) => p.id !== id)
          if (s.activePageId !== id) return { pages }
          const newActive = pages[0]
          return { pages, activePageId: newActive.id, canvas: newActive.canvas, layers: newActive.layers, selectedIds: [] }
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
          return { pages, activePageId: copy.id, canvas: copy.canvas, layers: copy.layers, selectedIds: [] }
        }),

      renamePage: (id, name) =>
        set((s) => ({ pages: s.pages.map((p) => (p.id === id ? { ...p, name } : p)) }))
    }),
    {
      partialize: (state) => ({
        name: state.name,
        canvas: state.canvas,
        layers: state.layers,
        pages: state.pages,
        activePageId: state.activePageId
      }),
      limit: 100
    }
  )
)
