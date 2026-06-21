import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import PageHeader from '@renderer/components/PageHeader'
import PlannerPostDialog from '@renderer/components/PlannerPostDialog'
import { useCurrentBrand } from '@renderer/stores/brandStore'
import { usePlannerStore, PLANNER_STATUS_COLORS } from '@renderer/stores/plannerStore'
import { cn } from '@renderer/lib/cn'
import {
  ymd,
  addDays,
  addMonths,
  startOfWeek,
  monthGrid,
  MONTH_NAMES,
  WEEKDAYS
} from '@renderer/lib/date'
import type { PlannerItem } from '@shared/types'

type View = 'month' | 'week' | 'day'

export default function Planner(): JSX.Element {
  const brand = useCurrentBrand()
  const brandId = brand?.id ?? ''
  const { items, load } = usePlannerStore()
  const [view, setView] = useState<View>('month')
  const [cursor, setCursor] = useState(new Date())
  const [dialog, setDialog] = useState<{ date: string; item: PlannerItem | null } | null>(null)

  useEffect(() => {
    if (brandId) void load(brandId)
  }, [brandId, load])

  const byDate = useMemo(() => {
    const m = new Map<string, PlannerItem[]>()
    for (const it of items) {
      const arr = m.get(it.date) ?? []
      arr.push(it)
      m.set(it.date, arr)
    }
    return m
  }, [items])

  const todayKey = ymd(new Date())

  function shift(dir: number): void {
    if (view === 'month') setCursor((c) => addMonths(c, dir))
    else if (view === 'week') setCursor((c) => addDays(c, dir * 7))
    else setCursor((c) => addDays(c, dir))
  }

  const label =
    view === 'day'
      ? cursor.toLocaleDateString(undefined, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        })
      : `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`

  function Chip({ it }: { it: PlannerItem }): JSX.Element {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation()
          setDialog({ date: it.date, item: it })
        }}
        className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded bg-surface-2 hover:bg-surface-3 text-left"
      >
        <span className={cn('h-2 w-2 rounded-full shrink-0', PLANNER_STATUS_COLORS[it.status])} />
        <span className="truncate text-[11px]">
          {it.time ? `${it.time} · ` : ''}
          {it.title}
        </span>
      </button>
    )
  }

  const days =
    view === 'month'
      ? monthGrid(cursor)
      : view === 'week'
        ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i))
        : [cursor]

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Social Planner"
        subtitle={label}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-md bg-surface-2 p-0.5">
              {(['month', 'week', 'day'] as View[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    'px-2.5 py-1 rounded text-xs capitalize',
                    view === v ? 'bg-surface-4 text-ink' : 'text-ink-muted'
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
            <button onClick={() => shift(-1)} className="btn-ghost px-2 py-1.5">
              <ChevronLeft size={16} />
            </button>
            <button onClick={() => setCursor(new Date())} className="btn-surface text-xs py-1.5">
              Today
            </button>
            <button onClick={() => shift(1)} className="btn-ghost px-2 py-1.5">
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => setDialog({ date: ymd(cursor), item: null })}
              className="btn-primary text-sm"
            >
              <Plus size={15} /> Post
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        {view === 'day' ? (
          <div className="max-w-2xl space-y-2">
            {(byDate.get(ymd(cursor)) ?? []).length === 0 ? (
              <p className="text-sm text-ink-faint">No posts this day.</p>
            ) : (
              (byDate.get(ymd(cursor)) ?? []).map((it) => <Chip key={it.id} it={it} />)
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-7 gap-2 mb-2">
              {WEEKDAYS.map((d) => (
                <div key={d} className="text-xs text-ink-faint text-center">
                  {d}
                </div>
              ))}
            </div>
            <div className={cn('grid grid-cols-7 gap-2', view === 'month' ? 'grid-rows-6' : '')}>
              {days.map((d) => {
                const key = ymd(d)
                const inMonth = view === 'week' || d.getMonth() === cursor.getMonth()
                const posts = byDate.get(key) ?? []
                return (
                  <div
                    key={key}
                    onClick={() => setDialog({ date: key, item: null })}
                    className={cn(
                      'rounded-lg border border-line p-1.5 cursor-pointer hover:border-surface-4 flex flex-col gap-1',
                      view === 'month' ? 'min-h-[96px]' : 'min-h-[300px]',
                      !inMonth && 'opacity-40'
                    )}
                  >
                    <div
                      className={cn(
                        'text-xs font-medium px-1',
                        key === todayKey ? 'text-accent' : 'text-ink-muted'
                      )}
                    >
                      {d.getDate()}
                    </div>
                    {posts.map((it) => (
                      <Chip key={it.id} it={it} />
                    ))}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {dialog && brandId && (
        <PlannerPostDialog
          brandId={brandId}
          item={dialog.item}
          date={dialog.date}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  )
}
