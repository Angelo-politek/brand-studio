import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LayoutTemplate,
  FolderKanban,
  Instagram,
  Images,
  CalendarDays,
  Clapperboard,
  Plus
} from 'lucide-react'
import PageHeader from '@renderer/components/PageHeader'
import { useCurrentBrand } from '@renderer/stores/brandStore'
import { PLANNER_STATUS_COLORS } from '@renderer/stores/plannerStore'
import { mediaUrl } from '@shared/ipc'
import { ymd } from '@renderer/lib/date'
import { cn } from '@renderer/lib/cn'
import type { PlannerItem, Project } from '@shared/types'

const QUICK = [
  { label: 'New design', icon: Plus, to: '/app/projects?new=instagram_post' },
  { label: 'Templates', icon: LayoutTemplate, to: '/app/templates' },
  { label: 'Story', icon: Instagram, to: '/app/projects?new=instagram_story' },
  { label: 'Video', icon: Clapperboard, to: '/app/videos' },
  { label: 'Assets', icon: Images, to: '/app/assets' },
  { label: 'Planner', icon: CalendarDays, to: '/app/planner' }
]

interface Counts {
  projects: number
  templates: number
  assets: number
}

export default function Dashboard(): JSX.Element {
  const brand = useCurrentBrand()
  const brandId = brand?.id ?? ''
  const navigate = useNavigate()
  const [recent, setRecent] = useState<Project[]>([])
  const [upcoming, setUpcoming] = useState<PlannerItem[]>([])
  const [counts, setCounts] = useState<Counts>({ projects: 0, templates: 0, assets: 0 })

  const load = useCallback(async () => {
    if (!brandId) return
    const [projects, templates, assets, planner] = await Promise.all([
      window.api.projects.list(brandId),
      window.api.templates.list(brandId),
      window.api.assets.list({ brandId }),
      window.api.planner.list(brandId)
    ])
    setRecent(projects.slice(0, 6))
    setCounts({ projects: projects.length, templates: templates.length, assets: assets.length })
    const today = ymd(new Date())
    setUpcoming(planner.filter((p) => p.date >= today).slice(0, 5))
  }, [brandId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title={brand?.name ?? 'Dashboard'}
        subtitle="Quick access to everything in this brand."
      />
      <div className="p-8 space-y-8">
        {/* Quick actions */}
        <div className="flex flex-wrap gap-3">
          {QUICK.map(({ label, icon: Icon, to }) => (
            <button
              key={label}
              onClick={() => navigate(to)}
              className="card px-4 py-3 flex items-center gap-2.5 hover:border-accent/60 hover:bg-surface-2 transition-colors"
            >
              <span className="text-accent">
                <Icon size={18} />
              </span>
              <span className="font-medium text-sm">{label}</span>
            </button>
          ))}
        </div>

        {/* Counters */}
        <div className="grid grid-cols-3 gap-4 max-w-xl">
          {(
            [
              ['Projects', counts.projects, '/app/projects'],
              ['Templates', counts.templates, '/app/templates'],
              ['Assets', counts.assets, '/app/assets']
            ] as [string, number, string][]
          ).map(([label, n, to]) => (
            <button key={label} onClick={() => navigate(to)} className="card p-4 text-left">
              <div className="text-2xl font-semibold text-ink">{n}</div>
              <div className="text-xs text-ink-faint">{label}</div>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Recent projects */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-ink">Recent projects</h2>
              <button
                onClick={() => navigate('/app/projects')}
                className="text-xs text-ink-faint hover:text-ink"
              >
                View all
              </button>
            </div>
            {recent.length === 0 ? (
              <p className="text-sm text-ink-faint">
                No projects yet.{' '}
                <button
                  onClick={() => navigate('/app/projects')}
                  className="text-accent hover:underline"
                >
                  Create one
                </button>
                .
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {recent.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => navigate(`/app/editor/${p.id}`)}
                    className="group card overflow-hidden text-left hover:border-accent/60 transition-colors"
                  >
                    <div className="aspect-[4/3] bg-surface-2 grid place-items-center overflow-hidden">
                      {p.thumbPath ? (
                        <img
                          src={mediaUrl(p.thumbPath)}
                          alt=""
                          className="max-h-full max-w-full object-contain"
                        />
                      ) : (
                        <FolderKanban size={20} className="text-ink-faint" />
                      )}
                    </div>
                    <div className="px-2 py-1.5 truncate text-xs font-medium">{p.name}</div>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Upcoming planner items */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-ink">Upcoming posts</h2>
              <button
                onClick={() => navigate('/app/planner')}
                className="text-xs text-ink-faint hover:text-ink"
              >
                Open planner
              </button>
            </div>
            {upcoming.length === 0 ? (
              <p className="text-sm text-ink-faint">Nothing scheduled.</p>
            ) : (
              <ul className="space-y-2">
                {upcoming.map((it) => (
                  <li key={it.id}>
                    <button
                      onClick={() => navigate('/app/planner')}
                      className="card w-full px-3 py-2.5 flex items-center gap-3 text-left hover:border-accent/60 transition-colors"
                    >
                      <span
                        className={cn(
                          'h-2 w-2 rounded-full shrink-0',
                          PLANNER_STATUS_COLORS[it.status] ?? 'bg-ink-faint'
                        )}
                      />
                      <span className="flex-1 truncate text-sm">{it.title}</span>
                      <span className="text-xs text-ink-faint shrink-0">
                        {it.date}
                        {it.time ? ` · ${it.time}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
