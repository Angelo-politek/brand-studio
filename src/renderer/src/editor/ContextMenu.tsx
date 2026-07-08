import { useEffect, useRef, useState } from 'react'
import {
  ArrowUp,
  ArrowDown,
  ChevronsUp,
  ChevronsDown,
  Copy,
  ClipboardPaste,
  Trash2,
  Lock,
  Unlock,
  AlignCenter,
  AlignCenterVertical,
  Palette,
  Wand2,
  Loader2,
  Group as GroupIcon,
  Ungroup
} from 'lucide-react'
import { useEditorStoreApi } from './editorStoreContext'
import { useCurrentBrand } from '@renderer/stores/brandStore'
import { usePythonStatus } from '@renderer/components/BackendStatus'
import { removeLayerBackground } from '@renderer/lib/imageOps'
import { toast } from '@renderer/stores/uiStore'

interface Props {
  layerId: string
  x: number
  y: number
  onClose: () => void
}

export default function ContextMenu({ layerId, x, y, onClose }: Props): JSX.Element {
  const useStore = useEditorStoreApi()
  const {
    layers,
    selectedIds,
    canvas,
    brandId,
    moveLayer,
    duplicateLayer,
    removeLayer,
    updateLayer,
    copySelected,
    paste,
    groupSelected,
    ungroupSelected
  } = useStore()
  const brand = useCurrentBrand()
  const aiReady = usePythonStatus().status === 'ready'
  const ref = useRef<HTMLDivElement>(null)
  const [bgBusy, setBgBusy] = useState(false)
  const layer = layers.find((l) => l.id === layerId)
  const selected = layers.filter((l) => selectedIds.includes(l.id))
  const canGroup = selected.length >= 2
  const canUngroup = selected.some((l) => l.groupId)

  function centerH(): void {
    if (!layer) return
    updateLayer(layerId, { x: canvas.width / 2 - (layer.width * layer.scaleX) / 2 })
  }
  function centerV(): void {
    if (!layer) return
    updateLayer(layerId, { y: canvas.height / 2 - (layer.height * layer.scaleY) / 2 })
  }
  function applyBrandColor(): void {
    const hex = brand?.colors[0]?.hex
    if (!layer || !hex) return
    const key = layer.type === 'line' || layer.type === 'arrow' ? 'strokeColor' : 'fill'
    updateLayer(layerId, { [key]: hex })
  }
  async function removeBg(): Promise<void> {
    if (!layer || !brandId) return
    setBgBusy(true)
    try {
      const ok = await removeLayerBackground(layer, brandId, updateLayer)
      if (ok) toast('Background removed.', 'success')
      else toast('Background removal unavailable (backend not ready).', 'error')
    } catch (e) {
      toast(`Background removal failed: ${(e as Error).message}`, 'error')
    } finally {
      setBgBusy(false)
      onClose()
    }
  }

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
  const menuW = 190
  const menuH = 340
  const left = x + menuW > window.innerWidth ? x - menuW : x
  const top = y + menuH > window.innerHeight ? Math.max(4, window.innerHeight - menuH) : y

  function item(
    label: string,
    icon: React.ReactNode,
    action: () => void,
    opts: { danger?: boolean; disabled?: boolean; closeAfter?: boolean } = {}
  ): JSX.Element {
    return (
      <button
        key={label}
        disabled={opts.disabled}
        onClick={() => {
          action()
          if (opts.closeAfter !== false) onClose()
        }}
        className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
          opts.danger ? 'text-red-400 hover:text-red-300 hover:bg-surface-3' : 'text-ink hover:bg-surface-3'
        }`}
      >
        {icon}
        {label}
      </button>
    )
  }

  const sep = (key: string): JSX.Element => <div key={key} className="my-1 border-t border-line" />

  if (!layer) return <></>

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-surface-1 border border-line rounded-lg shadow-xl py-1 min-w-[190px] max-h-[90vh] overflow-y-auto"
      style={{ left, top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Image-only AI action, front and center */}
      {layer.type === 'image' &&
        item(
          bgBusy ? 'Removing…' : 'Remove background',
          bgBusy ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />,
          () => void removeBg(),
          { disabled: bgBusy || !aiReady, closeAfter: false }
        )}
      {layer.type === 'image' && sep('s0')}

      {item('Bring to Front', <ChevronsUp size={13} />, () => moveLayer(layerId, 'top'))}
      {item('Bring Forward', <ArrowUp size={13} />, () => moveLayer(layerId, 'up'))}
      {item('Send Backward', <ArrowDown size={13} />, () => moveLayer(layerId, 'down'))}
      {item('Send to Back', <ChevronsDown size={13} />, () => moveLayer(layerId, 'bottom'))}

      {sep('s1')}

      {item('Center horizontally', <AlignCenter size={13} />, centerH)}
      {item('Center vertically', <AlignCenterVertical size={13} />, centerV)}
      {brand?.colors[0] && item('Apply brand color', <Palette size={13} />, applyBrandColor)}

      {(canGroup || canUngroup) && sep('s2')}
      {canGroup && item('Group', <GroupIcon size={13} />, () => groupSelected())}
      {canUngroup && item('Ungroup', <Ungroup size={13} />, () => ungroupSelected())}

      {sep('s3')}

      {item('Copy', <Copy size={13} />, () => copySelected())}
      {item('Paste', <ClipboardPaste size={13} />, () => paste())}
      {item('Duplicate', <Copy size={13} />, () => duplicateLayer(layerId))}
      {layer.locked
        ? item('Unlock', <Unlock size={13} />, () => updateLayer(layerId, { locked: false }))
        : item('Lock', <Lock size={13} />, () => updateLayer(layerId, { locked: true }))}

      {sep('s4')}

      {item('Delete', <Trash2 size={13} />, () => removeLayer(layerId), { danger: true })}
    </div>
  )
}
