import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Palette,
  LayoutTemplate,
  FolderKanban,
  CalendarDays,
  Images,
  Clapperboard,
  Download,
  Settings,
  ChevronsLeft
} from 'lucide-react'
import { cn } from '@renderer/lib/cn'
import { useBrandStore, useCurrentBrand } from '@renderer/stores/brandStore'

const NAV = [
  { to: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/app/brands', label: 'Brand', icon: Palette },
  { to: '/app/templates', label: 'Templates', icon: LayoutTemplate },
  { to: '/app/projects', label: 'Projects', icon: FolderKanban },
  { to: '/app/planner', label: 'Social Planner', icon: CalendarDays },
  { to: '/app/assets', label: 'Assets', icon: Images },
  { to: '/app/videos', label: 'Video Projects', icon: Clapperboard },
  { to: '/app/exports', label: 'Exports', icon: Download },
  { to: '/app/settings', label: 'Settings', icon: Settings }
]

export default function Sidebar(): JSX.Element {
  const brand = useCurrentBrand()
  const select = useBrandStore((s) => s.select)
  const navigate = useNavigate()

  function switchBrand(): void {
    select(null)
    navigate('/')
  }

  return (
    <aside className="w-60 shrink-0 h-full bg-surface-1 border-r border-line flex flex-col">
      <div className="px-4 py-4 border-b border-line">
        <div className="text-sm font-semibold tracking-tight text-ink">Brand Studio</div>
        <button
          onClick={switchBrand}
          className="mt-3 w-full group flex items-center gap-2 rounded-md bg-surface-2 hover:bg-surface-3 px-2.5 py-2 text-left transition-colors"
          title="Switch brand"
        >
          <span
            className="h-6 w-6 shrink-0 rounded grid place-items-center text-[11px] font-bold text-white"
            style={{ background: brand?.colors[0]?.hex ?? '#f97316' }}
          >
            {brand?.name?.[0]?.toUpperCase() ?? '?'}
          </span>
          <span className="flex-1 truncate text-sm text-ink">{brand?.name ?? 'No brand'}</span>
          <ChevronsLeft size={15} className="text-ink-faint group-hover:text-ink-muted" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-surface-3 text-ink'
                  : 'text-ink-muted hover:text-ink hover:bg-surface-2'
              )
            }
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-line text-[11px] text-ink-faint">
        Offline · Local-only
      </div>
    </aside>
  )
}
