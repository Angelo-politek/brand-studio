import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Trash2, ExternalLink } from 'lucide-react'
import { usePlannerStore } from '@renderer/stores/plannerStore'
import type { PlannerItem, PlannerStatus, Project } from '@shared/types'

const STATUSES: PlannerStatus[] = ['Idea', 'Draft', 'Ready', 'Scheduled', 'Published']
const PLATFORMS = ['Instagram', 'Facebook', 'LinkedIn', 'TikTok', 'YouTube', 'X', 'Other']

interface Props {
  brandId: string
  item: PlannerItem | null
  date: string
  onClose: () => void
}

export default function PlannerPostDialog({ brandId, item, date, onClose }: Props): JSX.Element {
  const { create, update, remove } = usePlannerStore()
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>([])
  const [form, setForm] = useState({
    title: item?.title ?? '',
    date: item?.date ?? date,
    time: item?.time ?? '',
    platform: item?.platform ?? '',
    status: (item?.status ?? 'Idea') as PlannerStatus,
    notes: item?.notes ?? '',
    projectId: item?.projectId ?? ''
  })

  useEffect(() => {
    void window.api.projects.list(brandId).then(setProjects)
  }, [brandId])

  async function save(): Promise<void> {
    const payload = {
      date: form.date,
      time: form.time || null,
      platform: form.platform || null,
      status: form.status,
      title: form.title.trim() || 'Untitled post',
      notes: form.notes || null,
      projectId: form.projectId || null
    }
    if (item) await update({ ...item, ...payload })
    else await create({ brandId, ...payload })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-6" onClick={onClose}>
      <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="font-semibold">{item ? 'Edit post' : 'New post'}</h2>
          <button onClick={onClose} className="btn-ghost px-1.5 py-1.5">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <input
            className="input"
            placeholder="Post title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              type="date"
              className="input"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
            <input
              type="time"
              className="input"
              value={form.time}
              onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <select
              className="input"
              value={form.platform}
              onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))}
            >
              <option value="">Platform…</option>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select
              className="input"
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as PlannerStatus }))}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <select
              className="input flex-1"
              value={form.projectId}
              onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}
            >
              <option value="">Link a project (optional)…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {form.projectId && (
              <button
                onClick={() => navigate(`/app/editor/${form.projectId}`)}
                className="btn-surface text-sm shrink-0"
                title="Open the linked design in the editor"
              >
                <ExternalLink size={14} /> Open
              </button>
            )}
          </div>
          <textarea
            className="input min-h-[64px] resize-y"
            placeholder="Notes"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-line">
          {item ? (
            <button
              onClick={async () => {
                await remove(item.id)
                onClose()
              }}
              className="btn-ghost text-sm text-red-400 hover:text-red-300"
            >
              <Trash2 size={14} /> Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost text-sm">
              Cancel
            </button>
            <button onClick={save} className="btn-primary text-sm">
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
