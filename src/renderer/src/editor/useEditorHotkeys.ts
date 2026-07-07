import { useHotkeys } from 'react-hotkeys-hook'
import { useEditorStore } from '@renderer/stores/editorStore'
import { callFit } from './fitRef'
import type { Layer } from '@shared/types'

/**
 * Minimal structural shape the hotkeys need. Both the design `editorStore` and
 * the video `videoEditorStore` satisfy it (same action surface + zundo temporal),
 * so the same shortcuts work in either editor.
 */
interface HotkeyStore {
  getState: () => {
    selectedIds: string[]
    layers: Layer[]
    removeSelected: () => void
    duplicateSelected: () => void
    nudgeSelected: (dx: number, dy: number) => void
    copySelected: () => void
    paste: () => void
    select: (id: string | null) => void
    setZoom: (z: number) => void
    groupSelected: () => void
    ungroupSelected: () => void
    moveLayer: (id: string, dir: 'up' | 'down' | 'top' | 'bottom') => void
    updateLayers: (patches: { id: string; patch: Partial<Layer> }[]) => void
  }
  temporal: { getState: () => { undo: () => void; redo: () => void } }
}

/** Editor keyboard shortcuts. react-hotkeys-hook ignores form fields by default. */
export function useEditorHotkeys(store: HotkeyStore = useEditorStore as HotkeyStore): void {
  useHotkeys(['delete', 'backspace'], (e) => {
    const s = store.getState()
    if (s.selectedIds.length) {
      e.preventDefault()
      s.removeSelected()
    }
  })

  useHotkeys('mod+z', (e) => {
    e.preventDefault()
    store.temporal.getState().undo()
  })

  useHotkeys(['mod+shift+z', 'mod+y'], (e) => {
    e.preventDefault()
    store.temporal.getState().redo()
  })

  useHotkeys('mod+d', (e) => {
    const s = store.getState()
    if (s.selectedIds.length) {
      e.preventDefault()
      s.duplicateSelected()
    }
  })

  useHotkeys('mod+c', () => store.getState().copySelected())
  useHotkeys('mod+v', (e) => {
    e.preventDefault()
    store.getState().paste()
  })

  useHotkeys('escape', () => store.getState().select(null))

  useHotkeys('mod+g', (e) => {
    e.preventDefault()
    store.getState().groupSelected()
  })
  useHotkeys('mod+shift+g', (e) => {
    e.preventDefault()
    store.getState().ungroupSelected()
  })

  // Z-order: Ctrl+]/[ move forward/back, Ctrl+Shift+]/[ to front/back.
  useHotkeys('mod+bracketright', (e) => {
    e.preventDefault()
    const s = store.getState()
    for (const id of s.selectedIds) s.moveLayer(id, 'up')
  })
  useHotkeys('mod+bracketleft', (e) => {
    e.preventDefault()
    const s = store.getState()
    for (const id of s.selectedIds) s.moveLayer(id, 'down')
  })
  useHotkeys('mod+shift+bracketright', (e) => {
    e.preventDefault()
    const s = store.getState()
    for (const id of s.selectedIds) s.moveLayer(id, 'top')
  })
  useHotkeys('mod+shift+bracketleft', (e) => {
    e.preventDefault()
    const s = store.getState()
    for (const id of s.selectedIds) s.moveLayer(id, 'bottom')
  })

  // Flip: Shift+H horizontal, Shift+V vertical.
  useHotkeys('shift+h', (e) => {
    const s = store.getState()
    if (!s.selectedIds.length) return
    e.preventDefault()
    s.updateLayers(
      s.layers
        .filter((l) => s.selectedIds.includes(l.id))
        .map((l) => ({ id: l.id, patch: { scaleX: -l.scaleX } }))
    )
  })
  useHotkeys('shift+v', (e) => {
    const s = store.getState()
    if (!s.selectedIds.length) return
    e.preventDefault()
    s.updateLayers(
      s.layers
        .filter((l) => s.selectedIds.includes(l.id))
        .map((l) => ({ id: l.id, patch: { scaleY: -l.scaleY } }))
    )
  })

  useHotkeys('mod+0', (e) => {
    e.preventDefault()
    callFit()
  })
  useHotkeys('mod+1', (e) => {
    e.preventDefault()
    store.getState().setZoom(1)
  })

  useHotkeys(['up', 'down', 'left', 'right'], (e) => {
    const s = store.getState()
    if (!s.selectedIds.length) return
    e.preventDefault()
    const d = e.shiftKey ? 10 : 1
    switch (e.key) {
      case 'ArrowUp':
        s.nudgeSelected(0, -d)
        break
      case 'ArrowDown':
        s.nudgeSelected(0, d)
        break
      case 'ArrowLeft':
        s.nudgeSelected(-d, 0)
        break
      case 'ArrowRight':
        s.nudgeSelected(d, 0)
        break
    }
  })
}
