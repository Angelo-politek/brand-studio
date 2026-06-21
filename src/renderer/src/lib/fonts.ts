import { mediaUrl } from '@shared/ipc'
import type { Brand } from '@shared/types'

const registered = new Set<string>()

/** Register a custom font file (data-root-relative) under the given family name. */
export async function registerFont(family: string, relativePath?: string | null): Promise<void> {
  if (!relativePath || !family) return
  const key = `${family}@@${relativePath}`
  if (registered.has(key)) return
  try {
    const face = new FontFace(family, `url("${mediaUrl(relativePath)}")`)
    await face.load()
    document.fonts.add(face)
    registered.add(key)
  } catch (err) {
    console.warn('[fonts] failed to load', family, err)
  }
}

/** Register all custom (file-backed) fonts for a brand so Konva/text can use them. */
export async function ensureBrandFonts(brand: Brand | null): Promise<void> {
  if (!brand) return
  await Promise.all(brand.fonts.map((f) => registerFont(f.family, f.filePath)))
}
