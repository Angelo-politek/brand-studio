import { v4 as uuid } from 'uuid'
import type { Layer } from '@shared/types'

const VAR_RE = /\{\{\s*([A-Z0-9_]+)\s*\}\}/g

/** Unique {{VARIABLE}} names referenced across all text layers. */
export function extractVariables(layers: Layer[]): string[] {
  const set = new Set<string>()
  for (const l of layers) {
    if (l.type === 'text' && l.text) {
      for (const m of l.text.matchAll(VAR_RE)) set.add(m[1])
    }
  }
  return [...set]
}

/** Replace {{VARIABLE}} placeholders in text layers with provided values. */
export function applyVariables(layers: Layer[], values: Record<string, string>): Layer[] {
  return layers.map((l) =>
    l.type === 'text' && l.text
      ? { ...l, text: l.text.replace(VAR_RE, (_, k: string) => values[k] ?? `{{${k}}}`) }
      : l
  )
}

/** Deep-clone layers with fresh ids (for instantiating a template into a project). */
export function cloneLayers(layers: Layer[]): Layer[] {
  return layers.map((l) => ({ ...structuredClone(l), id: uuid() }))
}
