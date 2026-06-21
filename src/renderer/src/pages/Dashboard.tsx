import { useNavigate } from 'react-router-dom'
import {
  LayoutTemplate,
  FolderKanban,
  Instagram,
  Images,
  CalendarDays,
  Type,
  Download,
  Clapperboard
} from 'lucide-react'
import PageHeader from '@renderer/components/PageHeader'
import { useCurrentBrand } from '@renderer/stores/brandStore'

const TILES = [
  { label: 'Templates', icon: LayoutTemplate, to: '/app/templates' },
  { label: 'Projects', icon: FolderKanban, to: '/app/projects' },
  { label: 'Instagram Post', icon: Instagram, to: '/app/projects?new=instagram_post' },
  { label: 'Instagram Story', icon: Instagram, to: '/app/projects?new=instagram_story' },
  { label: 'Video Projects', icon: Clapperboard, to: '/app/videos' },
  { label: 'Assets', icon: Images, to: '/app/assets' },
  { label: 'Planner', icon: CalendarDays, to: '/app/planner' },
  { label: 'Fonts', icon: Type, to: '/app/brands' },
  { label: 'Exports', icon: Download, to: '/app/exports' }
]

export default function Dashboard(): JSX.Element {
  const brand = useCurrentBrand()
  const navigate = useNavigate()

  return (
    <div className="h-full flex flex-col">
      <PageHeader title={brand?.name ?? 'Dashboard'} subtitle="Quick access to everything in this brand." />
      <div className="p-8">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {TILES.map(({ label, icon: Icon, to }) => (
            <button
              key={label}
              onClick={() => navigate(to)}
              className="card p-5 flex flex-col items-start gap-3 hover:border-accent/60 hover:bg-surface-2 transition-colors text-left"
            >
              <span className="h-10 w-10 rounded-lg bg-surface-3 grid place-items-center text-accent">
                <Icon size={20} />
              </span>
              <span className="font-medium">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
