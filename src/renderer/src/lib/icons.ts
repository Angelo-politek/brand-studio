import iconNodes from 'lucide-static/icon-nodes.json'
import iconTags from 'lucide-static/tags.json'

/**
 * Offline icon library backed by lucide-static (~1990 ISC-licensed SVGs).
 * SVGs are lazy-loaded per name via Vite's glob import, recolored by
 * substituting `currentColor`, and rasterized to an HTMLImageElement for Konva.
 */

// All icon files, loaded on demand (returns the raw SVG string).
const svgModules = import.meta.glob('/node_modules/lucide-static/icons/*.svg', {
  query: '?raw',
  import: 'default'
}) as Record<string, () => Promise<string>>

const byName = new Map<string, () => Promise<string>>()
for (const path in svgModules) {
  const name = path.split('/').pop()!.replace('.svg', '')
  byName.set(name, svgModules[path])
}

const tags = iconTags as Record<string, string[]>

export interface IconEntry {
  name: string
  /** Human label (kebab → Title Case). */
  label: string
}

/** All icon names (sorted). */
export const ALL_ICONS: IconEntry[] = Object.keys(iconNodes as Record<string, unknown>)
  .sort()
  .map((name) => ({ name, label: titleCase(name) }))

function titleCase(name: string): string {
  return name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** Filter icons by name or tag substring. Empty query → all. */
export function searchIcons(query: string, limit = 300): IconEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return ALL_ICONS.slice(0, limit)
  const out: IconEntry[] = []
  for (const entry of ALL_ICONS) {
    if (out.length >= limit) break
    if (entry.name.includes(q) || (tags[entry.name] ?? []).some((t) => t.includes(q))) {
      out.push(entry)
    }
  }
  return out
}

const rawCache = new Map<string, string>()

/** Load the raw SVG markup for an icon (cached). */
export async function loadIconSvg(name: string): Promise<string | null> {
  const cached = rawCache.get(name)
  if (cached) return cached
  const loader = byName.get(name)
  if (!loader) return null
  const svg = await loader()
  rawCache.set(name, svg)
  return svg
}

/** Recolor an icon SVG's stroke/fill to `color`. */
export function colorizeSvg(svg: string, color: string): string {
  return svg.replace(/currentColor/g, color).replace(/stroke="currentColor"/g, `stroke="${color}"`)
}

const imgCache = new Map<string, HTMLImageElement>()

/**
 * Rasterize a recolored icon to an HTMLImageElement (cached per name+color).
 * Used by both the live Konva node and the export path.
 */
export async function iconToImage(
  name: string,
  color: string,
  svgOverride?: string
): Promise<HTMLImageElement | null> {
  const key = `${name}:${color}`
  const hit = imgCache.get(key)
  if (hit) return hit
  const raw = svgOverride ?? (await loadIconSvg(name))
  if (!raw) return null
  const colored = colorizeSvg(raw, color)
  const url = `data:image/svg+xml;utf8,${encodeURIComponent(colored)}`
  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => resolve(null)
    el.src = url
  })
  if (img) imgCache.set(key, img)
  return img
}
