import { useCallback, useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  Type,
  Square,
  Circle,
  Triangle,
  Hexagon,
  Minus,
  MoveRight,
  Shapes,
  Images,
  Upload,
  Loader2,
  Disc,
  RotateCw,
  SlidersVertical,
  Plug,
  Lightbulb,
  ToggleLeft,
  CircleDot,
  Settings2,
  Calculator,
  MonitorSmartphone
} from 'lucide-react'
import { cn } from '@renderer/lib/cn'
import { mediaUrl } from '@shared/ipc'
import { useEditorStoreApi } from './editorStoreContext'
import { useCurrentBrand } from '@renderer/stores/brandStore'
import { useAssetStore } from '@renderer/stores/assetStore'
import {
  createTextLayer,
  createShapeLayer,
  createImageLayer,
  createPanelComponent
} from './factory'
import { isImageMime } from '@renderer/lib/mime'
import { pickFiles } from '@renderer/lib/files'
import { ASSET_FOLDERS } from '@shared/types'
import type { Asset, AssetFolder, LayerType, PanelComponentKind } from '@shared/types'

const SHAPES: { type: LayerType; label: string; icon: typeof Square }[] = [
  { type: 'rect', label: 'Rectangle', icon: Square },
  { type: 'circle', label: 'Circle', icon: Circle },
  { type: 'triangle', label: 'Triangle', icon: Triangle },
  { type: 'polygon', label: 'Polygon', icon: Hexagon },
  { type: 'line', label: 'Line', icon: Minus },
  { type: 'arrow', label: 'Arrow', icon: MoveRight }
]

/** Hardware components for music-gear front panel mockups. */
const HARDWARE: { kind: PanelComponentKind; label: string; icon: typeof Square }[] = [
  { kind: 'knob', label: 'Knob', icon: Disc },
  { kind: 'encoder', label: 'Encoder', icon: RotateCw },
  { kind: 'fader', label: 'Fader', icon: SlidersVertical },
  { kind: 'jack', label: 'Jack', icon: Plug },
  { kind: 'led', label: 'LED', icon: Lightbulb },
  { kind: 'toggle', label: 'Toggle', icon: ToggleLeft },
  { kind: 'pushbutton', label: 'Button', icon: CircleDot },
  { kind: 'screw', label: 'Screw', icon: Settings2 },
  { kind: 'display7seg', label: '7-seg', icon: Calculator },
  { kind: 'displayOled', label: 'OLED', icon: MonitorSmartphone }
]

type FolderTab = AssetFolder | 'All'
const FOLDER_TABS: FolderTab[] = ['All', ...ASSET_FOLDERS]

export default function ElementsPanel(): JSX.Element {
  const [tab, setTab] = useState<'elements' | 'assets'>('elements')
  const [folder, setFolder] = useState<FolderTab>('All')
  const useStore = useEditorStoreApi()
  const { canvas, addLayer } = useStore()
  const brand = useCurrentBrand()
  const [assets, setAssets] = useState<Asset[]>([])
  const importBlobs = useAssetStore((s) => s.importBlobs)
  const importPaths = useAssetStore((s) => s.importPaths)
  const importing = useAssetStore((s) => s.importing)

  const loadAssets = useCallback(async () => {
    if (!brand) return
    const all = await window.api.assets.list({
      brandId: brand.id,
      folder: folder === 'All' ? undefined : folder
    })
    // Only images can be dropped onto the canvas as layers.
    setAssets(all.filter((a) => isImageMime(a.mime)))
  }, [brand, folder])

  useEffect(() => {
    if (tab !== 'assets') return
    void loadAssets()
  }, [tab, loadAssets])

  const onDrop = useCallback(
    async (files: File[]) => {
      if (!brand || files.length === 0) return
      // Import into the currently selected folder (or auto by mime when "All").
      const prevFolder = useAssetStore.getState().folder
      useAssetStore.setState({ folder: folder === 'All' ? 'All' : folder })
      await importBlobs(brand.id, files)
      useAssetStore.setState({ folder: prevFolder })
      await loadAssets()
    },
    [brand, folder, importBlobs, loadAssets]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true
  })

  async function uploadViaDialog(): Promise<void> {
    if (!brand) return
    const paths = await pickFiles(undefined, true)
    if (paths.length === 0) return
    const prevFolder = useAssetStore.getState().folder
    useAssetStore.setState({ folder: folder === 'All' ? 'All' : folder })
    await importPaths(brand.id, paths)
    useAssetStore.setState({ folder: prevFolder })
    await loadAssets()
  }

  function addText(): void {
    addLayer(
      createTextLayer(canvas, brand?.fonts.find((f) => f.role === 'heading')?.family ?? 'Inter')
    )
  }
  function addShape(type: LayerType): void {
    const fill = brand?.colors[0]?.hex ?? '#f97316'
    addLayer(createShapeLayer(type, canvas, fill))
  }
  function addImage(asset: Asset): void {
    addLayer(
      createImageLayer(canvas, asset.filePath, asset.width ?? 800, asset.height ?? 800, asset.name)
    )
  }
  function addHardware(kind: PanelComponentKind): void {
    // Indicators/LEDs pick up the brand accent (or primary) automatically.
    const accent = brand?.colors.find((c) => c.role === 'accent')?.hex ?? brand?.colors[0]?.hex
    addLayer(createPanelComponent(kind, canvas, accent))
  }

  return (
    <div className="w-64 shrink-0 h-full bg-surface-1 border-r border-line flex flex-col">
      <div className="flex border-b border-line">
        {(['elements', 'assets'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium capitalize',
              tab === t ? 'text-ink border-b-2 border-accent' : 'text-ink-muted'
            )}
          >
            {t === 'elements' ? <Shapes size={14} /> : <Images size={14} />}
            {t}
          </button>
        ))}
      </div>

      {tab === 'elements' ? (
        <div className="flex-1 overflow-y-auto p-3">
          <div className="space-y-4">
            <div>
              <div className="text-[11px] text-ink-faint mb-2">Text</div>
              <button onClick={addText} className="btn-surface w-full justify-start">
                <Type size={15} /> Add text
              </button>
            </div>
            <div>
              <div className="text-[11px] text-ink-faint mb-2">Shapes</div>
              <div className="grid grid-cols-2 gap-2">
                {SHAPES.map(({ type, label, icon: Icon }) => (
                  <button
                    key={type}
                    onClick={() => addShape(type)}
                    className="btn-surface flex-col h-16 gap-1 text-[11px]"
                  >
                    <Icon size={18} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-ink-faint mb-2">Hardware (front panel)</div>
              <div className="grid grid-cols-2 gap-2">
                {HARDWARE.map(({ kind, label, icon: Icon }) => (
                  <button
                    key={kind}
                    onClick={() => addHardware(kind)}
                    className="btn-surface flex-col h-16 gap-1 text-[11px]"
                  >
                    <Icon size={18} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Upload */}
          <div className="p-3 pb-2">
            <button
              onClick={uploadViaDialog}
              disabled={importing || !brand}
              className="btn-surface w-full justify-center text-sm disabled:opacity-50"
            >
              {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {importing ? 'Uploading…' : 'Upload'}
            </button>
          </div>

          {/* Folder tabs */}
          <div className="px-3 pb-2 flex gap-1 overflow-x-auto">
            {FOLDER_TABS.map((f) => (
              <button
                key={f}
                onClick={() => setFolder(f)}
                className={cn(
                  'px-2 py-1 rounded text-[11px] whitespace-nowrap transition-colors',
                  folder === f ? 'bg-surface-3 text-ink' : 'text-ink-muted hover:bg-surface-2'
                )}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Drop area + grid */}
          <div {...getRootProps()} className="relative flex-1 overflow-y-auto px-3 pb-3">
            <input {...getInputProps()} />
            {isDragActive && (
              <div className="absolute inset-2 z-10 rounded-lg border-2 border-dashed border-accent bg-accent/10 grid place-items-center pointer-events-none">
                <span className="text-accent text-xs font-medium">Drop to upload</span>
              </div>
            )}
            {assets.length === 0 ? (
              <p className="text-xs text-ink-faint text-center py-6">
                No image assets here yet. Drop files or use Upload.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {assets.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => addImage(a)}
                    draggable
                    onDragStart={(e) => {
                      // Internal drag → dropped on the canvas at the cursor
                      // (EditorCanvas onDrop). Custom key so OS file drops
                      // (uploads) are never confused with placements.
                      e.dataTransfer.setData(
                        'application/x-brandstudio-asset',
                        JSON.stringify({
                          filePath: a.filePath,
                          width: a.width ?? 800,
                          height: a.height ?? 800,
                          name: a.name
                        })
                      )
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                    className="aspect-square rounded-md border border-line checkerboard overflow-hidden grid place-items-center p-1 hover:border-accent"
                    title={`Add ${a.name} (click or drag onto the canvas)`}
                  >
                    <img
                      src={mediaUrl(a.thumbPath ?? a.filePath)}
                      alt={a.name}
                      className="max-h-full max-w-full object-contain"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
