import { create } from 'zustand'
import type { PlannerItem } from '@shared/types'
import type { PlannerCreateInput } from '@shared/ipc'

interface PlannerState {
  items: PlannerItem[]
  load: (brandId: string) => Promise<void>
  create: (input: PlannerCreateInput) => Promise<void>
  update: (item: PlannerItem) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const usePlannerStore = create<PlannerState>((set) => ({
  items: [],
  async load(brandId) {
    set({ items: await window.api.planner.list(brandId) })
  },
  async create(input) {
    const item = await window.api.planner.create(input)
    set((s) => ({ items: [...s.items, item] }))
  },
  async update(item) {
    const updated = await window.api.planner.update(item)
    set((s) => ({ items: s.items.map((i) => (i.id === updated.id ? updated : i)) }))
  },
  async remove(id) {
    await window.api.planner.delete(id)
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }))
  }
}))

export const PLANNER_STATUS_COLORS: Record<string, string> = {
  Idea: 'bg-slate-500',
  Draft: 'bg-blue-500',
  Ready: 'bg-green-500',
  Scheduled: 'bg-amber-500',
  Published: 'bg-purple-500'
}
