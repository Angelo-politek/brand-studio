import { useCallback, useEffect, useState } from 'react'
import { FolderOpen, ExternalLink, FileText } from 'lucide-react'
import PageHeader from '@renderer/components/PageHeader'
import { useCurrentBrand } from '@renderer/stores/brandStore'
import { mediaUrl } from '@shared/ipc'
import type { ExportRecord } from '@shared/types'

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}

export default function Exports(): JSX.Element {
  const brand = useCurrentBrand()
  const brandId = brand?.id ?? ''
  const [records, setRecords] = useState<ExportRecord[]>([])

  const refresh = useCallback(async () => {
    if (brandId) setRecords(await window.api.exports.list({ brandId }))
  }, [brandId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="Exports" subtitle="Everything you've exported from this brand." />

      <div className="flex-1 overflow-y-auto p-8">
        {records.length === 0 ? (
          <div className="h-full grid place-items-center text-ink-faint text-sm">
            No exports yet. Export a design from the editor.
          </div>
        ) : (
          <div className="space-y-2 max-w-3xl">
            {records.map((r) => {
              const isImg = ['png', 'jpg', 'webp'].includes(r.format)
              return (
                <div key={r.id} className="card flex items-center gap-4 p-3">
                  <div className="h-14 w-14 shrink-0 rounded-md checkerboard grid place-items-center overflow-hidden">
                    {isImg ? (
                      <img
                        src={mediaUrl(r.filePath)}
                        alt=""
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <FileText size={22} className="text-ink-faint" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-medium">{basename(r.filePath)}</div>
                    <div className="text-xs text-ink-faint">
                      {r.format.toUpperCase()} · {new Date(r.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <button
                    onClick={() => window.api.app.openPath(r.filePath)}
                    className="btn-ghost text-sm"
                    title="Open"
                  >
                    <ExternalLink size={15} />
                  </button>
                  <button
                    onClick={() => window.api.app.showInFolder(r.filePath)}
                    className="btn-ghost text-sm"
                    title="Show in folder"
                  >
                    <FolderOpen size={15} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
