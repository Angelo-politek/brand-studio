import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, Clapperboard, X } from 'lucide-react'
import PageHeader from '@renderer/components/PageHeader'
import { useCurrentBrand } from '@renderer/stores/brandStore'
import { useVideoStore } from '@renderer/stores/videoStore'
import { confirmDialog } from '@renderer/stores/uiStore'
import { mediaUrl } from '@shared/ipc'
import { VIDEO_PRESETS } from '@renderer/lib/presets'
import { REEL_TEMPLATES } from '@renderer/lib/reelTemplates'
import { cn } from '@renderer/lib/cn'
import type { VideoScene } from '@shared/types'

function formatDuration(scenesMs: number): string {
  const sec = scenesMs / 1000
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** "New reel" dialog: pick a format and a starter template (or blank). */
function NewReelDialog({
  onClose,
  onCreate
}: {
  onClose: () => void
  onCreate: (input: { name: string; width: number; height: number; scenes: VideoScene[] }) => void
}): JSX.Element {
  const [selected, setSelected] = useState(VIDEO_PRESETS[0])
  const [templateId, setTemplateId] = useState(REEL_TEMPLATES[0].id)
  const [name, setName] = useState('Untitled reel')

  function submit(): void {
    const tpl = REEL_TEMPLATES.find((t) => t.id === templateId) ?? REEL_TEMPLATES[0]
    onCreate({
      name: name.trim() || 'Untitled reel',
      width: selected.width,
      height: selected.height,
      scenes: tpl.build(selected.width, selected.height)
    })
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-6" onClick={onClose}>
      <div className="card w-full max-w-xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="font-semibold">New reel / video</h2>
          <button onClick={onClose} className="btn-ghost px-1.5 py-1.5"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-5 overflow-y-auto">
          {/* Format */}
          <div>
            <div className="text-xs text-ink-faint mb-2">Format</div>
            <div className="grid grid-cols-3 gap-3">
              {VIDEO_PRESETS.map((p) => {
                const active = selected.type === p.type
                const ar = p.width / p.height
                return (
                  <button
                    key={p.type}
                    onClick={() => setSelected(p)}
                    className={cn('card p-3 flex flex-col items-center gap-2 hover:border-accent/60', active && 'border-accent')}
                  >
                    <div className="h-14 grid place-items-center">
                      <div className="bg-surface-3 border border-line rounded" style={{ width: 48 * ar, height: 48 }} />
                    </div>
                    <div className="text-xs font-medium text-center">{p.label}</div>
                    <div className="text-[10px] text-ink-faint">{p.width}×{p.height}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Template */}
          <div>
            <div className="text-xs text-ink-faint mb-2">Start from</div>
            <div className="grid grid-cols-2 gap-2">
              {REEL_TEMPLATES.map((t) => {
                const active = templateId === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => setTemplateId(t.id)}
                    className={cn('card p-3 text-left hover:border-accent/60', active && 'border-accent')}
                  >
                    <div className="text-sm font-medium">{t.name}</div>
                    <div className="text-[11px] text-ink-faint mt-0.5">{t.description}</div>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs text-ink-faint mb-1">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-line">
          <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
          <button onClick={submit} className="btn-primary text-sm">Create</button>
        </div>
      </div>
    </div>
  )
}

export default function VideoProjects(): JSX.Element {
  const brand = useCurrentBrand()
  const brandId = brand?.id ?? ''
  const navigate = useNavigate()
  const { projects, load, create, remove } = useVideoStore()
  const [dialogOpen, setDialogOpen] = useState(false)

  const refresh = useCallback(async () => {
    if (brandId) await load(brandId)
  }, [brandId, load])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function handleCreate(input: { name: string; width: number; height: number; scenes: VideoScene[] }): Promise<void> {
    setDialogOpen(false)
    const vp = await create({ brandId, name: input.name, width: input.width, height: input.height, scenes: input.scenes })
    navigate(`/app/video/${vp.id}`)
  }

  async function del(e: React.MouseEvent, id: string): Promise<void> {
    e.stopPropagation()
    if (await confirmDialog('Delete this video project?')) {
      await remove(id)
    }
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Video Projects"
        subtitle="Build reels on a timeline of scenes — clips, text, music."
        actions={
          <button onClick={() => setDialogOpen(true)} className="btn-primary text-sm">
            <Plus size={15} /> New reel
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-8">
        {projects.length === 0 ? (
          <div className="h-full grid place-items-center text-center">
            <div>
              <Clapperboard size={40} className="mx-auto mb-3 text-ink-faint" />
              <p className="text-ink-faint mb-4">No video projects yet.</p>
              <button onClick={() => setDialogOpen(true)} className="btn-primary">
                <Plus size={15} /> Create your first reel
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {projects.map((vp) => {
              const totalMs = (vp.scenes ?? []).reduce((sum, s) => sum + s.durationMs, 0)
              return (
                <div
                  key={vp.id}
                  onClick={() => navigate(`/app/video/${vp.id}`)}
                  className="group card overflow-hidden cursor-pointer hover:border-accent/60 transition-colors"
                >
                  <div className="aspect-video bg-surface-2 grid place-items-center overflow-hidden relative">
                    {vp.thumbPath ? (
                      <img src={mediaUrl(vp.thumbPath)} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Clapperboard size={32} className="text-ink-faint" />
                    )}
                    <button
                      onClick={(e) => void del(e, vp.id)}
                      className="absolute top-2 right-2 h-7 w-7 rounded bg-black/60 text-white grid place-items-center opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                    <span className="absolute bottom-2 right-2 text-[11px] bg-black/60 text-white px-1.5 py-0.5 rounded">
                      {formatDuration(totalMs)}
                    </span>
                  </div>
                  <div className="px-3 py-2">
                    <div className="truncate text-sm font-medium">{vp.name}</div>
                    <div className="text-[11px] text-ink-faint">
                      {vp.width}×{vp.height} · {(vp.scenes ?? []).length} scene{(vp.scenes ?? []).length === 1 ? '' : 's'}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {dialogOpen && <NewReelDialog onClose={() => setDialogOpen(false)} onCreate={(i) => void handleCreate(i)} />}
    </div>
  )
}
