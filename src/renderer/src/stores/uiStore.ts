import { create } from 'zustand'
import { v4 as uuid } from 'uuid'

export type ToastType = 'info' | 'success' | 'error'

interface Toast {
  id: string
  message: string
  type: ToastType
}

interface ConfirmState {
  message: string
  resolve: (v: boolean) => void
}

interface PromptState {
  message: string
  defaultValue: string
  resolve: (v: string | null) => void
}

interface UiState {
  toasts: Toast[]
  confirmState: ConfirmState | null
  promptState: PromptState | null
  pushToast: (message: string, type?: ToastType) => void
  dismiss: (id: string) => void
  confirm: (message: string) => Promise<boolean>
  resolveConfirm: (v: boolean) => void
  prompt: (message: string, defaultValue?: string) => Promise<string | null>
  resolvePrompt: (v: string | null) => void
}

export const useUiStore = create<UiState>((set, get) => ({
  toasts: [],
  confirmState: null,
  promptState: null,
  pushToast: (message, type = 'info') => {
    const id = uuid()
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
    setTimeout(() => get().dismiss(id), 3500)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  confirm: (message) => new Promise<boolean>((resolve) => set({ confirmState: { message, resolve } })),
  resolveConfirm: (v) => {
    get().confirmState?.resolve(v)
    set({ confirmState: null })
  },
  prompt: (message, defaultValue = '') =>
    new Promise<string | null>((resolve) => set({ promptState: { message, defaultValue, resolve } })),
  resolvePrompt: (v) => {
    get().promptState?.resolve(v)
    set({ promptState: null })
  }
}))

// Imperative helpers usable from event handlers (outside React).
export const toast = (m: string, t?: ToastType): void => useUiStore.getState().pushToast(m, t)
export const confirmDialog = (m: string): Promise<boolean> => useUiStore.getState().confirm(m)
export const promptDialog = (m: string, d?: string): Promise<string | null> =>
  useUiStore.getState().prompt(m, d)
