import { useEffect, useRef } from 'react'
import { ArrowUp, ArrowDown, ChevronsUp, ChevronsDown, Copy, Trash2, Lock, Unlock } from 'lucide-react'
import { useEditorStoreApi } from './editorStoreContext'

interface Props {
  layerId: string
  x: number
  y: number
  onClose: () => void
}

export default function ContextMenu({ layerId, x, y, onClose }: Props): JSX.Element {
  const useStore = useEditorStoreApi()
  const { layers, moveLayer, duplicateLayer, removeLayer, updateLayer } = useStore()
  const ref = useRef<HTMLDivElement>(null)
  const layer = layers.find((l) => l.id === layerId)

  useEffect(() => {
    function handleClick(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  // Flip menu if it would go off-screen
  const menuW = 180
  const menuH = 220
  const left = x + menuW > window.innerWidth ? x - menuW : x
  const top = y + menuH > window.innerHeight ? y - menuH : y

  function item(
    label: string,
    icon: React.ReactNode,
    action: () => void,
    danger = false
  ): JSX.Element {
    return (
      <button
        key={label}
        onClick={() => { action(); onClose() }}
        className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-surface-3 transition-colors ${danger ? 'text-red-400 hover:text-red-300' : 'text-ink'}`}
      >
        {icon}
        {label}
      </button>
    )
  }

  if (!layer) return <></>

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-surface-1 border border-line rounded-lg shadow-xl py-1 min-w-[180px]"
      style={{ left, top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {item('Bring to Front', <ChevronsUp size={13} />, () => moveLayer(layerId, 'top'))}
      {item('Bring Forward', <ArrowUp size={13} />, () => moveLayer(layerId, 'up'))}
      {item('Send Backward', <ArrowDown size={13} />, () => moveLayer(layerId, 'down'))}
      {item('Send to Back', <ChevronsDown size={13} />, () => moveLayer(layerId, 'bottom'))}

      <div className="my-1 border-t border-line" />

      {item('Duplicate', <Copy size={13} />, () => duplicateLayer(layerId))}
      {layer.locked
        ? item('Unlock', <Unlock size={13} />, () => updateLayer(layerId, { locked: false }))
        : item('Lock', <Lock size={13} />, () => updateLayer(layerId, { locked: true }))}

      <div className="my-1 border-t border-line" />

      {item('Delete', <Trash2 size={13} />, () => removeLayer(layerId), true)}
    </div>
  )
}
