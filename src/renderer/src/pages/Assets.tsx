import { useCallback, useEffect, useMemo } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, Search, Loader2 } from 'lucide-react'
import PageHeader from '@renderer/components/PageHeader'
import AssetGrid from '@renderer/components/assets/AssetGrid'
import AssetDetails from '@renderer/components/assets/AssetDetails'
import { useAssetStore, type FolderFilter } from '@renderer/stores/assetStore'
import { useCurrentBrand } from '@renderer/stores/brandStore'
import { pickFiles } from '@renderer/lib/files'
import { confirmDialog } from '@renderer/stores/uiStore'
import { cn } from '@renderer/lib/cn'
import { ASSET_FOLDERS } from '@shared/types'

const FOLDERS: FolderFilter[] = ['All', ...ASSET_FOLDERS]

export default function Assets(): JSX.Element {
  const brand = useCurrentBrand()
  const brandId = brand?.id ?? ''
  const {
    assets,
    folder,
    search,
    loading,
    importing,
    selectedId,
    setFolder,
    setSearch,
    select,
    refresh,
    importBlobs,
    importPaths,
    updateAsset,
    remove
  } = useAssetStore()

  // Reload when brand or folder changes; debounce search.
  useEffect(() => {
    if (!brandId) return
    const t = setTimeout(() => void refresh(brandId), search ? 250 : 0)
    return () => clearTimeout(t)
  }, [brandId, folder, search, refresh])

  const onDrop = useCallback(
    (files: File[]) => {
      if (brandId && files.length) void importBlobs(brandId, files)
    },
    [brandId, importBlobs]
  )
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true
  })

  async function importViaDialog(): Promise<void> {
    const paths = await pickFiles(undefined, true)
    if (paths.length) void importPaths(brandId, paths)
  }

  const selected = useMemo(() => assets.find((a) => a.id === selectedId) ?? null, [assets, selectedId])

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Assets"
        subtitle="Centralized library — drag files anywhere to import."
        actions={
          <button onClick={importViaDialog} className="btn-primary text-sm">
            <Upload size={15} /> Import
          </button>
        }
      />

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Toolbar */}
          <div className="flex items-center gap-3 px-6 py-3 border-b border-line">
            <div className="flex gap-1 overflow-x-auto">
              {FOLDERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFolder(f)}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors',
                    folder === f ? 'bg-surface-3 text-ink' : 'text-ink-muted hover:bg-surface-2'
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="ml-auto relative">
              <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                className="input pl-8 w-64"
                placeholder="Search name or #tag"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Drop area + grid */}
          <div {...getRootProps()} className="relative flex-1 min-h-0 p-6">
            <input {...getInputProps()} />
            {isDragActive && (
              <div className="absolute inset-4 z-10 rounded-xl border-2 border-dashed border-accent bg-accent/10 grid place-items-center pointer-events-none">
                <span className="text-accent font-medium">Drop to import</span>
              </div>
            )}
            {importing && (
              <div className="absolute top-2 right-8 z-10 flex items-center gap-2 text-xs text-ink-muted">
                <Loader2 size={14} className="animate-spin" /> Importing…
              </div>
            )}

            {assets.length === 0 && !loading ? (
              <div className="h-full grid place-items-center">
                <button
                  onClick={open}
                  className="flex flex-col items-center gap-3 text-ink-faint hover:text-accent"
                >
                  <Upload size={28} />
                  <span className="text-sm">Drop files here or click to import</span>
                </button>
              </div>
            ) : (
              <AssetGrid assets={assets} selectedId={selectedId} onSelect={select} />
            )}
          </div>
        </div>

        {selected && (
          <AssetDetails
            asset={selected}
            onClose={() => select(null)}
            onChange={updateAsset}
            onDelete={async (id) => {
              if (await confirmDialog('Delete this asset?')) void remove(id)
            }}
          />
        )}
      </div>
    </div>
  )
}
