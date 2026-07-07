// Recently-used colors, persisted in localStorage and shared across all
// ColorPicker instances. Small module-level pub/sub so pickers re-render when
// a new color is added anywhere.

const KEY = 'bs:recentColors'
const MAX = 8

let recent: string[] = load()
const listeners = new Set<() => void>()

function load(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    const arr = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(arr)
      ? arr.filter((c): c is string => typeof c === 'string').slice(0, MAX)
      : []
  } catch {
    return []
  }
}

export function getRecentColors(): string[] {
  return recent
}

export function pushRecentColor(hex: string): void {
  const h = hex.toLowerCase()
  if (!/^#[0-9a-f]{6}$/.test(h)) return
  const next = [h, ...recent.filter((c) => c !== h)].slice(0, MAX)
  if (next.length === recent.length && next.every((c, i) => c === recent[i])) return
  recent = next
  try {
    localStorage.setItem(KEY, JSON.stringify(recent))
  } catch {
    /* storage full / unavailable — keep in memory only */
  }
  listeners.forEach((fn) => fn())
}

export function subscribeRecentColors(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** True when the browser exposes the EyeDropper API (Chromium/Electron do). */
export function hasEyeDropper(): boolean {
  return typeof (window as unknown as { EyeDropper?: unknown }).EyeDropper === 'function'
}

/** Open the OS eyedropper and return the picked hex, or null if cancelled. */
export async function pickWithEyeDropper(): Promise<string | null> {
  const Ctor = (
    window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }
  ).EyeDropper
  if (!Ctor) return null
  try {
    const result = await new Ctor().open()
    return result.sRGBHex
  } catch {
    return null // user pressed Escape
  }
}
