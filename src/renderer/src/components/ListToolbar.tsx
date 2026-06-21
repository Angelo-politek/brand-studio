import { Search } from 'lucide-react'

export type SortKey = 'recent' | 'name'

interface Props {
  query: string
  onQuery: (q: string) => void
  sort: SortKey
  onSort: (s: SortKey) => void
  placeholder?: string
  /** Optional extra controls rendered on the right (e.g. bulk actions). */
  right?: React.ReactNode
}

/** Reusable search + sort bar for the grid pages (Projects/Templates/Assets). */
export default function ListToolbar({
  query,
  onQuery,
  sort,
  onSort,
  placeholder = 'Search…',
  right
}: Props): JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex-1 max-w-sm">
        <Search
          size={15}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"
        />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-surface-2 rounded-md pl-8 pr-3 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-accent/40"
        />
      </div>
      <select
        value={sort}
        onChange={(e) => onSort(e.target.value as SortKey)}
        className="bg-surface-2 rounded-md px-2 py-1.5 text-sm text-ink-muted focus:outline-none focus:ring-1 focus:ring-accent/40"
        title="Sort by"
      >
        <option value="recent">Recent</option>
        <option value="name">Name</option>
      </select>
      {right}
    </div>
  )
}
