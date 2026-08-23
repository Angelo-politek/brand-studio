import { create } from 'zustand'
import { temporal } from 'zundo'
import { v4 as uuid } from 'uuid'
import {
  createLayerSlice,
  layerSliceInitialState,
  type LayerSliceActions,
  type LayerSliceState
} from './layerSlice'
import type { CanvasSpec, Layer, Page, Project } from '@shared/types'

// Re-exported so existing importers (tests, imageOps, videoEditorStore) keep
// working now that the implementations live in the shared slice.
export { layerAabb, expandToGroups, clone, SAFE_INSET } from './layerSlice'

interface EditorState extends LayerSliceState, LayerSliceActions {
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

  gridSize: number

  loadProject: (p: Project) => void
  setName: (name: string) => void

  // Page management
  setActivePage: (id: string) => void
  addPage: () => void
  deletePage: (id: string) => void
  duplicatePage: (id: string) => void
  renamePage: (id: string, name: string) => void
  reorderPage: (id: string, toIndex: number) => void
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
      ...layerSliceInitialState,

      // Shared layer/selection/alignment actions, wired to the `pages` array.
      ...createLayerSlice<EditorState>(set, get, (s, canvas, layers) => ({
        pages: syncPages(s.pages, s.activePageId, canvas, layers)
      })),

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
