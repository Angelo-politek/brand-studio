import { useHotkeys } from 'react-hotkeys-hook'
import { useEditorStore } from '@renderer/stores/editorStore'
import { callFit } from './fitRef'

/** Editor keyboard shortcuts. react-hotkeys-hook ignores form fields by default. */
export function useEditorHotkeys(): void {
  useHotkeys(['delete', 'backspace'], (e) => {
    const s = useEditorStore.getState()
    if (s.selectedIds.length) {
      e.preventDefault()
      s.removeSelected()
    }
  })

  useHotkeys('mod+z', (e) => {
    e.preventDefault()
    useEditorStore.temporal.getState().undo()
  })

  useHotkeys(['mod+shift+z', 'mod+y'], (e) => {
    e.preventDefault()
    useEditorStore.temporal.getState().redo()
  })

  useHotkeys('mod+d', (e) => {
    const s = useEditorStore.getState()
    if (s.selectedIds.length) {
      e.preventDefault()
      s.duplicateSelected()
    }
  })

  useHotkeys('mod+c', () => useEditorStore.getState().copySelected())
  useHotkeys('mod+v', (e) => {
    e.preventDefault()
    useEditorStore.getState().paste()
  })

  useHotkeys('escape', () => useEditorStore.getState().select(null))

  useHotkeys('mod+0', (e) => { e.preventDefault(); callFit() })
  useHotkeys('mod+1', (e) => { e.preventDefault(); useEditorStore.getState().setZoom(1) })

  useHotkeys(['up', 'down', 'left', 'right'], (e) => {
    const s = useEditorStore.getState()
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
