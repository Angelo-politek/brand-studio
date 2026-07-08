import { useEffect, useRef, useState } from 'react'
import { X, Upload, Loader2, Play, Pause } from 'lucide-react'
import { useCurrentBrand } from '@renderer/stores/brandStore'
import { useAssetStore } from '@renderer/stores/assetStore'
import { pickFiles } from '@renderer/lib/files'
import { mediaUrl } from '@shared/ipc'
import type { Asset, AssetFolder } from '@shared/types'

/** Modal to pick (or upload) an asset of a given folder, e.g. Videos or Audio. */
export default function AssetPickerDialog({
  folder,
  title,
  onPick,
  onClose
}: {
  folder: AssetFolder
  title: string
  onPick: (asset: Asset) => void
  onClose: () => void
}): JSX.Element {
  const brand = useCurrentBrand()
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const importPaths = useAssetStore((s) => s.importPaths)
  const importing = useAssetStore((s) => s.importing)

  async function refresh(): Promise<void> {
    if (!brand) return
    setLoading(true)
    const list = await window.api.assets.list({ brandId: brand.id, folder })
    setAssets(list)
    setLoading(false)
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand, folder])

  async function upload(): Promise<void> {
    if (!brand) return
    const paths = await pickFiles(undefined, true)
    if (paths.length === 0) return
    const prev = useAssetStore.getState().folder
    useAssetStore.setState({ folder })
    await importPaths(brand.id, paths)
    useAssetStore.setState({ folder: prev })
    await refresh()
  }

  const isAudio = folder === 'Audio'

  // Audio audition: one shared <audio>, toggled per row.
  const previewRef = useRef<HTMLAudioElement | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  function togglePreview(a: Asset): void {
    let el = previewRef.current
    if (!el) {
      el = new Audio()
      el.onended = () => setPreviewId(null)
      previewRef.current = el
    }
    if (previewId === a.id) {
      el.pause()
      setPreviewId(null)
      return
    }
    el.src = mediaUrl(a.filePath)
    void el.play().catch(() => {})
    setPreviewId(a.id)
  }
  useEffect(
    () => () => {
      previewRef.current?.pause()
    },
    []
  )

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-6" onClick={onClose}>
      <div
        className="card w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="font-semibold">{title}</h2>
          <div className="flex items-center gap-2">
            <button onClick={upload} disabled={importing} className="btn-surface text-sm">
              {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}{' '}
              Upload
            </button>
            <button onClick={onClose} className="btn-ghost px-1.5 py-1.5">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="h-32 grid place-items-center text-ink-faint">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : assets.length === 0 ? (
            <p className="text-sm text-ink-faint text-center py-8">
              No {folder.toLowerCase()} yet. Click Upload to add some.
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {assets.map((a) => (
                <button
                  key={a.id}
                  onClick={() => onPick(a)}
                  className="card p-2 flex flex-col items-center gap-1.5 hover:border-accent/60"
                  title={a.name}
                >
                  {isAudio ? (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation()
                        togglePreview(a)
                      }}
                      className="h-16 w-full grid place-items-center bg-surface-3 rounded text-ink-faint hover:text-accent"
                      title={previewId === a.id ? 'Ferma anteprima' : 'Ascolta anteprima'}
                    >
                      {previewId === a.id ? <Pause size={20} /> : <Play size={20} />}
                    </div>
                  ) : a.thumbPath ? (
                    <img
                      src={mediaUrl(a.thumbPath)}
                      alt={a.name}
                      className="h-16 w-full object-cover rounded"
                    />
                  ) : (
                    <video
                      src={mediaUrl(a.filePath)}
                      className="h-16 w-full object-cover rounded"
                      muted
                    />
                  )}
                  <span className="text-[11px] truncate w-full text-center">{a.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
