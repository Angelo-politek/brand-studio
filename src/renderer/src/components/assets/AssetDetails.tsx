import { useEffect, useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { mediaUrl } from '@shared/ipc'
import { isImageMime } from '@renderer/lib/mime'
import { ASSET_FOLDERS, type Asset, type AssetFolder } from '@shared/types'

interface Props {
  asset: Asset
  onClose: () => void
  onChange: (asset: Asset) => void
  onDelete: (id: string) => void
  extraActions?: React.ReactNode
}

export default function AssetDetails({
  asset,
  onClose,
  onChange,
  onDelete,
  extraActions
}: Props): JSX.Element {
  const [name, setName] = useState(asset.name)
  const [tags, setTags] = useState(asset.tags.join(', '))
  const [folder, setFolder] = useState<AssetFolder>(asset.folder)

  useEffect(() => {
    setName(asset.name)
    setTags(asset.tags.join(', '))
    setFolder(asset.folder)
  }, [asset.id, asset.name, asset.tags, asset.folder])

  function commit(partial: Partial<Asset>): void {
    onChange({ ...asset, ...partial })
  }

  return (
    <aside className="w-72 shrink-0 h-full border-l border-line bg-surface-1 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-line">
        <span className="text-sm font-medium">Asset details</span>
        <button onClick={onClose} className="btn-ghost px-1.5 py-1.5">
          <X size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="aspect-square rounded-lg checkerboard grid place-items-center overflow-hidden p-2">
          {isImageMime(asset.mime) ? (
            <img
              src={mediaUrl(asset.thumbPath ?? asset.filePath)}
              alt=""
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="text-xs text-ink-faint">{asset.mime}</span>
          )}
        </div>

        <div>
          <label className="block text-xs text-ink-faint mb-1">Name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name !== asset.name && commit({ name })}
          />
        </div>

        <div>
          <label className="block text-xs text-ink-faint mb-1">Folder</label>
          <select
            className="input"
            value={folder}
            onChange={(e) => {
              const f = e.target.value as AssetFolder
              setFolder(f)
              commit({ folder: f })
            }}
          >
            {ASSET_FOLDERS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-ink-faint mb-1">Tags (comma separated)</label>
          <input
            className="input"
            value={tags}
            placeholder="event, promo, product"
            onChange={(e) => setTags(e.target.value)}
            onBlur={() =>
              commit({
                tags: tags
                  .split(',')
                  .map((t) => t.trim().replace(/^#/, ''))
                  .filter(Boolean)
              })
            }
          />
        </div>

        <dl className="text-xs text-ink-faint space-y-1">
          <div className="flex justify-between">
            <dt>Type</dt>
            <dd className="text-ink-muted">{asset.mime}</dd>
          </div>
          {asset.width && asset.height && (
            <div className="flex justify-between">
              <dt>Dimensions</dt>
              <dd className="text-ink-muted">
                {asset.width}×{asset.height}
              </dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt>Size</dt>
            <dd className="text-ink-muted">{(asset.size / 1024).toFixed(0)} KB</dd>
          </div>
        </dl>

        {extraActions}
      </div>

      <div className="p-4 border-t border-line">
        <button
          onClick={() => onDelete(asset.id)}
          className="btn w-full bg-red-500/10 text-red-400 hover:bg-red-500/20"
        >
          <Trash2 size={15} /> Delete asset
        </button>
      </div>
    </aside>
  )
}
