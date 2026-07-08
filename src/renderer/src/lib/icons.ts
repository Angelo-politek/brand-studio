import iconTags from 'lucide-static/tags.json'
import simpleData from 'simple-icons/icons.json'

/**
 * Offline icon library from two sources, both bundled:
 *  - lucide-static: ~1990 outline icons (stroke=currentColor), recolorable.
 *  - simple-icons: ~3400 brand logos (single fill path) with official colors.
 *
 * Icon identity is `<source>:<name>` (e.g. "lucide:heart", "simple:spotify")
 * so the two sets never collide. SVGs are lazy-loaded via Vite glob, recolored,
 * and rasterized to an HTMLImageElement for Konva (live node + export).
 *
 * Globs are RELATIVE to this file so they resolve from the package's
 * node_modules in dev (Vite root = src/renderer) and in the production build.
 */

const lucideModules = import.meta.glob('../../../../node_modules/lucide-static/icons/*.svg', {
  query: '?raw',
  import: 'default'
}) as Record<string, () => Promise<string>>

const simpleModules = import.meta.glob('../../../../node_modules/simple-icons/icons/*.svg', {
  query: '?raw',
  import: 'default'
}) as Record<string, () => Promise<string>>

const lucideByName = new Map<string, () => Promise<string>>()
for (const path in lucideModules) {
  lucideByName.set(fileStem(path), lucideModules[path])
}
const simpleByName = new Map<string, () => Promise<string>>()
for (const path in simpleModules) {
  simpleByName.set(fileStem(path), simpleModules[path])
}

function fileStem(path: string): string {
  return path.split('/').pop()!.replace('.svg', '')
}

const tags = iconTags as Record<string, string[]>

/** Official brand colors, keyed by slug. */
const simpleMeta = new Map<string, { title: string; hex: string }>()
for (const it of simpleData as { title: string; slug: string; hex: string }[]) {
  simpleMeta.set(it.slug, { title: it.title, hex: `#${it.hex}` })
}

export type IconCategory = 'all' | 'social' | 'audio' | 'general'

export interface IconEntry {
  /** "<source>:<name>" — the value stored on the layer. */
  id: string
  source: 'lucide' | 'simple'
  name: string
  label: string
  /** Default color: official brand hex (simple) or null (lucide → brand color). */
  defaultColor: string | null
}

// Curated slug lists for the social + audio category chips (Simple Icons).
const SOCIAL_SLUGS = [
  'instagram', 'tiktok', 'youtube', 'youtubemusic', 'youtubeshorts', 'x', 'facebook',
  'threads', 'snapchat', 'pinterest', 'linkedin', 'whatsapp', 'telegram', 'discord',
  'twitch', 'reddit', 'tumblr', 'mastodon', 'bluesky', 'vimeo', 'behance', 'dribbble',
  'medium', 'substack', 'patreon', 'kofi', 'buymeacoffee', 'onlyfans', 'wechat', 'line',
  'messenger', 'signal'
]
const AUDIO_SLUGS = [
  'spotify', 'applemusic', 'soundcloud', 'bandcamp', 'audiomack', 'deezer', 'tidal',
  'youtubemusic', 'beatport', 'mixcloud', 'audius', 'napster', 'shazam', 'discogs',
  'lastdotfm', 'ableton', 'flstudio', 'audacity', 'reaper', 'protools', 'steinberg',
  'nativeinstruments', 'akaipro', 'roland', 'korg', 'moog', 'arturia', 'behringer',
  'focusrite', 'presonus', 'novation', 'teenageengineering', 'elektron'
]
// Lucide names that are audio/music related (outline, recolorable).
const AUDIO_LUCIDE = [
  'music', 'music-2', 'music-3', 'music-4', 'audio-lines', 'audio-waveform', 'waves',
  'headphones', 'ear', 'speaker', 'volume', 'volume-1', 'volume-2', 'volume-x',
  'mic', 'mic-2', 'mic-off', 'radio', 'disc', 'disc-2', 'disc-3', 'disc-album',
  'play', 'pause', 'square-play', 'circle-play', 'skip-back', 'skip-forward',
  'fast-forward', 'rewind', 'repeat', 'shuffle', 'list-music', 'piano', 'guitar',
  'drum', 'cassette-tape', 'sliders-horizontal', 'sliders-vertical'
]

function titleCase(name: string): string {
  return name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

const lucideEntries: IconEntry[] = [...lucideByName.keys()].sort().map((name) => ({
  id: `lucide:${name}`,
  source: 'lucide' as const,
  name,
  label: titleCase(name),
  defaultColor: null
}))

const simpleEntries: IconEntry[] = [...simpleByName.keys()].sort().map((slug) => {
  const meta = simpleMeta.get(slug)
  return {
    id: `simple:${slug}`,
    source: 'simple' as const,
    name: slug,
    label: meta?.title ?? titleCase(slug),
    defaultColor: meta?.hex ?? '#111111'
  }
})

/** Everything, brands first (they're what people usually want). */
export const ALL_ICONS: IconEntry[] = [...simpleEntries, ...lucideEntries]

const socialSet = new Set(SOCIAL_SLUGS)
const audioSimpleSet = new Set(AUDIO_SLUGS)
const audioLucideSet = new Set(AUDIO_LUCIDE)

function inCategory(entry: IconEntry, cat: IconCategory): boolean {
  if (cat === 'all') return true
  if (cat === 'social') return entry.source === 'simple' && socialSet.has(entry.name)
  if (cat === 'audio') {
    return (
      (entry.source === 'simple' && audioSimpleSet.has(entry.name)) ||
      (entry.source === 'lucide' && audioLucideSet.has(entry.name))
    )
  }
  // general = lucide outline icons (excluding the audio ones, still searchable elsewhere)
  return entry.source === 'lucide'
}

/** Filter icons by category + query (name / brand title / lucide tags). */
export function searchIcons(query: string, category: IconCategory = 'all', limit = 300): IconEntry[] {
  const q = query.trim().toLowerCase()
  const out: IconEntry[] = []
  // Curated categories preserve their hand-picked order; 'all'/'general' are big.
  const pool =
    category === 'social'
      ? SOCIAL_SLUGS.map((s) => simpleEntries.find((e) => e.name === s)).filter(Boolean) as IconEntry[]
      : category === 'audio'
        ? [
            ...AUDIO_SLUGS.map((s) => simpleEntries.find((e) => e.name === s)),
            ...AUDIO_LUCIDE.map((n) => lucideEntries.find((e) => e.name === n))
          ].filter(Boolean) as IconEntry[]
        : ALL_ICONS
  for (const entry of pool) {
    if (out.length >= limit) break
    if (category !== 'social' && category !== 'audio' && !inCategory(entry, category)) continue
    if (!q) {
      out.push(entry)
      continue
    }
    if (
      entry.name.includes(q) ||
      entry.label.toLowerCase().includes(q) ||
      (entry.source === 'lucide' && (tags[entry.name] ?? []).some((t) => t.includes(q)))
    ) {
      out.push(entry)
    }
  }
  return out
}

/** Look up an entry (for its defaultColor) by id. */
export function iconEntry(id: string): IconEntry | undefined {
  return ALL_ICONS.find((e) => e.id === id)
}

const rawCache = new Map<string, string>()

/** Load the raw SVG markup for an icon id ("source:name"). */
export async function loadIconSvg(id: string): Promise<string | null> {
  const cached = rawCache.get(id)
  if (cached) return cached
  const [source, name] = splitId(id)
  const loader = source === 'simple' ? simpleByName.get(name) : lucideByName.get(name)
  if (!loader) return null
  const svg = await loader()
  rawCache.set(id, svg)
  return svg
}

function splitId(id: string): ['lucide' | 'simple', string] {
  const i = id.indexOf(':')
  if (i < 0) return ['lucide', id] // back-compat with old "name"-only ids
  const src = id.slice(0, i)
  return [src === 'simple' ? 'simple' : 'lucide', id.slice(i + 1)]
}

/**
 * Recolor an icon SVG. Lucide uses stroke=currentColor; Simple Icons use a
 * default fill. A null color keeps the icon's own colors (brand logos).
 */
export function colorizeSvg(svg: string, color: string | null, source: 'lucide' | 'simple'): string {
  if (!color) return svg
  if (source === 'lucide') {
    return svg.replace(/currentColor/g, color)
  }
  // Simple Icons: a single monochrome path; force a fill on the root <svg>.
  return svg.replace('<svg ', `<svg fill="${color}" `)
}

const imgCache = new Map<string, HTMLImageElement>()

/**
 * Rasterize a recolored icon to an HTMLImageElement (cached per id+color).
 * `color` null → the icon's intrinsic colors (brand logos).
 */
export async function iconToImage(
  id: string,
  color: string | null,
  svgOverride?: string
): Promise<HTMLImageElement | null> {
  const key = `${id}:${color ?? 'orig'}`
  const hit = imgCache.get(key)
  if (hit) return hit
  const [source] = splitId(id)
  const raw = svgOverride ?? (await loadIconSvg(id))
  if (!raw) return null
  const colored = colorizeSvg(raw, color, source)
  const url = `data:image/svg+xml;utf8,${encodeURIComponent(colored)}`
  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const el = new Image()
    // A malformed SVG data-URL may fire neither onload nor onerror; time out
    // so callers (e.g. the video export loop) can't hang forever.
    const timer = setTimeout(() => resolve(null), 8000)
    el.onload = () => {
      clearTimeout(timer)
      resolve(el)
    }
    el.onerror = () => {
      clearTimeout(timer)
      resolve(null)
    }
    el.src = url
  })
  if (img) imgCache.set(key, img)
  return img
}
