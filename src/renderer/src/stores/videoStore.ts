import { create } from 'zustand'
import type { VideoProject } from '@shared/types'
import type { VideoCreateInput } from '@shared/ipc'

interface VideoState {
  projects: VideoProject[]
  current: VideoProject | null
  load: (brandId: string) => Promise<void>
  create: (input: VideoCreateInput) => Promise<VideoProject>
  setCurrent: (vp: VideoProject | null) => void
  update: (vp: VideoProject) => Promise<VideoProject>
  remove: (id: string) => Promise<void>
}

export const useVideoStore = create<VideoState>((set) => ({
  projects: [],
  current: null,

  async load(brandId) {
    const projects = await window.api.video.list(brandId)
    set({ projects })
  },

  async create(input) {
    const vp = await window.api.video.create(input)
    set((s) => ({ projects: [vp, ...s.projects] }))
    return vp
  },

  setCurrent(vp) {
    set({ current: vp })
  },

  async update(vp) {
    const updated = await window.api.video.update(vp)
    set((s) => ({
      projects: s.projects.map((p) => (p.id === updated.id ? updated : p)),
      current: s.current?.id === updated.id ? updated : s.current
    }))
    return updated
  },

  async remove(id) {
    await window.api.video.delete(id)
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      current: s.current?.id === id ? null : s.current
    }))
  }
}))
