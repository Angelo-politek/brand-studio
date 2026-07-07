import { createContext, useContext } from 'react'
import type { StoreApi, UseBoundStore } from 'zustand'
import { useEditorStore } from '@renderer/stores/editorStore'
import type { CanvasSpec, Layer } from '@shared/types'

/**
 * The subset of editor-store state/actions used by the SHARED canvas
 * components (EditorCanvas, Inspector, LayersPanel, ElementsPanel, LayerNode,
 * CropOverlay, ContextMenu). Both the design `editorStore` and the video
 * `videoEditorStore` implement this surface, so the components work unchanged
 * against either one.
 */
export interface SharedEditorState {
  brandId: string | null
  canvas: CanvasSpec
  layers: Layer[]
  selectedIds: string[]
  zoom: number
  pan: { x: number; y: number }
  showGrid: boolean
  showSafe: boolean
  gridSize: number
  cropMode: string | null

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
  setCropMode: (id: string | null) => void
  setZoom: (zoom: number) => void
  setPan: (pan: { x: number; y: number }) => void
}

export type SharedEditorStore = UseBoundStore<StoreApi<SharedEditorState>>

interface EditorContextValue {
  store: SharedEditorStore
  /** True when used inside the video (timeline) editor. */
  isVideo: boolean
}

/**
 * Default = the design `useEditorStore`, so any shared component rendered
 * without a provider behaves exactly as before (no regression for the design
 * editor). The cast is safe: editorStore is a superset of SharedEditorState.
 */
const EditorStoreContext = createContext<EditorContextValue>({
  store: useEditorStore as unknown as SharedEditorStore,
  isVideo: false
})

export function EditorStoreProvider({
  store,
  isVideo = false,
  children
}: {
  store: SharedEditorStore
  isVideo?: boolean
  children: React.ReactNode
}): JSX.Element {
  return (
    <EditorStoreContext.Provider value={{ store, isVideo }}>{children}</EditorStoreContext.Provider>
  )
}

/** Returns the active editor store hook (design or video). */
export function useEditorStoreApi(): SharedEditorStore {
  return useContext(EditorStoreContext).store
}

/** True when the shared components are rendered inside the video editor. */
export function useIsVideoEditor(): boolean {
  return useContext(EditorStoreContext).isVideo
}
