import { mediaUrl } from '@shared/ipc'
import type { Brand } from '@shared/types'

// Vite `?url` imports resolve to a dev-server path in dev and a hashed,
// build-relative path in the packaged app — unlike a hardcoded `/fonts/...`
// string, this works under the `file://` origin used in production.
import interRegular from '@renderer/assets/fonts/inter/Inter-Regular.woff2?url'
import interBold from '@renderer/assets/fonts/inter/Inter-Bold.woff2?url'
import interItalic from '@renderer/assets/fonts/inter/Inter-Italic.woff2?url'
import interBoldItalic from '@renderer/assets/fonts/inter/Inter-BoldItalic.woff2?url'

const registered = new Set<string>()

async function loadFace(
  family: string,
  url: string,
  descriptors?: FontFaceDescriptors
): Promise<void> {
  const key = `${family}@@${url}@@${descriptors?.weight ?? ''}@@${descriptors?.style ?? ''}`
  if (registered.has(key)) return
  try {
    const face = new FontFace(family, `url("${url}")`, descriptors)
    await face.load()
    document.fonts.add(face)
    registered.add(key)
  } catch (err) {
    console.warn('[fonts] failed to load', family, err)
  }
}

/** Register a custom font file (data-root-relative) under the given family name. */
export async function registerFont(family: string, relativePath?: string | null): Promise<void> {
  if (!relativePath || !family) return
  await loadFace(family, mediaUrl(relativePath))
}

/** Register all custom (file-backed) fonts for a brand so Konva/text can use them. */
export async function ensureBrandFonts(brand: Brand | null): Promise<void> {
  if (!brand) return
  await Promise.all(brand.fonts.map((f) => registerFont(f.family, f.filePath)))
}

/**
 * Register the Inter font bundled with the app (regular/bold/italic/bold
 * italic) as `FontFace`s so Konva's canvas rendering — which, unlike normal
 * DOM text, does not pick up a plain CSS `@font-face` until the font has
 * actually been loaded — always has it ready. Designs then render
 * identically across machines regardless of what's installed system-wide.
 * Safe to call multiple times; each face is only loaded once.
 */
export async function ensureBundledFonts(): Promise<void> {
  await Promise.all([
    loadFace('Inter', interRegular, { weight: '400', style: 'normal' }),
    loadFace('Inter', interBold, { weight: '700', style: 'normal' }),
    loadFace('Inter', interItalic, { weight: '400', style: 'italic' }),
    loadFace('Inter', interBoldItalic, { weight: '700', style: 'italic' })
  ])
}
