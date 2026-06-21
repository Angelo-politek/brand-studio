import { useEffect, useMemo, useRef, useState } from 'react'
import { VList } from 'virtua'
import { FileText, Film, Music, FileQuestion } from 'lucide-react'
import { cn } from '@renderer/lib/cn'
import { mediaUrl } from '@shared/ipc'
import { isImageMime, isVideoMime } from '@renderer/lib/mime'
import type { Asset } from '@shared/types'

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function AssetThumb({ asset }: { asset: Asset }): JSX.Element {
  if (asset.thumbPath) {
    return <img src={mediaUrl(asset.thumbPath)} alt="" className="max-h-full max-w-full object-contain" />
  }
  if (isImageMime(asset.mime)) {
    return <img src={mediaUrl(asset.filePath)} alt="" className="max-h-full max-w-full object-contain" />
  }
  const Icon = isVideoMime(asset.mime)
    ? Film
    : asset.mime.startsWith('audio/')
      ? Music
      : asset.mime === 'application/pdf'
        ? FileText
        : FileQuestion
  return <Icon size={32} className="text-ink-faint" />
}

interface Props {
  assets: Asset[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export default function AssetGrid({ assets, selectedId, onSelect }: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [cols, setCols] = useState(4)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setCols(Math.max(1, Math.floor(el.clientWidth / 168)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const rows = useMemo(() => chunk(assets, cols), [assets, cols])

  return (
    <div ref={ref} className="h-full">
      <VList style={{ height: '100%' }}>
        {rows.map((row, ri) => (
          <div
            key={ri}
            className="grid gap-3 pb-3"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}
          >
            {row.map((a) => (
              <button
                key={a.id}
                onClick={() => onSelect(a.id)}
                className={cn(
                  'group flex flex-col rounded-lg border bg-surface-1 overflow-hidden text-left transition-colors',
                  selectedId === a.id ? 'border-accent' : 'border-line hover:border-surface-4'
                )}
              >
                <div className="aspect-square checkerboard grid place-items-center overflow-hidden p-2">
                  <AssetThumb asset={a} />
                </div>
                <div className="px-2 py-1.5 border-t border-line">
                  <div className="truncate text-xs text-ink">{a.name}</div>
                  {a.tags.length > 0 && (
                    <div className="truncate text-[10px] text-ink-faint">
                      {a.tags.map((t) => `#${t}`).join(' ')}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        ))}
      </VList>
    </div>
  )
}
