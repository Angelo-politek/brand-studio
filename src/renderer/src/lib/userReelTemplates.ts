import { v4 as uuid } from 'uuid'
import type { AudioTrack, VideoScene } from '@shared/types'

/**
 * User-saved reel templates: whole video projects (scenes + optional music)
 * captured from the video editor and stored as JSON under
 * <dataRoot>/templates/reels.json. File-based on purpose — no DB migration
 * needed, and templates survive DB resets. Complements the built-in starter
 * templates in reelTemplates.ts.
 */

export interface UserReelTemplate {
  id: string
  name: string
  width: number
  height: number
  scenes: VideoScene[]
  audio?: AudioTrack | null
  createdAt: number
}

const FILE = 'reels.json'

async function fileAbsPath(): Promise<string> {
  const paths = await window.api.app.getPaths()
  return `${paths.dataRoot.replace(/\\/g, '/')}/templates/${FILE}`
}

export async function listUserReelTemplates(): Promise<UserReelTemplate[]> {
  try {
    const bytes = await window.api.app.readFile(await fileAbsPath())
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as UserReelTemplate[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return [] // missing or corrupt file → empty library
  }
}

async function writeAll(all: UserReelTemplate[]): Promise<void> {
  await window.api.app.saveBinaryNamed({
    subdir: 'templates',
    filename: FILE,
    bytes: new TextEncoder().encode(JSON.stringify(all, null, 2))
  })
}

export async function saveUserReelTemplate(
  t: Omit<UserReelTemplate, 'id' | 'createdAt'>
): Promise<UserReelTemplate> {
  const all = await listUserReelTemplates()
  const tpl: UserReelTemplate = { ...t, id: uuid(), createdAt: Date.now() }
  all.push(tpl)
  await writeAll(all)
  return tpl
}

export async function deleteUserReelTemplate(id: string): Promise<void> {
  await writeAll((await listUserReelTemplates()).filter((t) => t.id !== id))
}

/** Fresh scene/layer ids so the new project never shares ids with the template. */
export function instantiateUserReelTemplate(tpl: UserReelTemplate): {
  width: number
  height: number
  scenes: VideoScene[]
  audio: AudioTrack | null
} {
  return {
    width: tpl.width,
    height: tpl.height,
    scenes: tpl.scenes.map((s) => ({
      ...structuredClone(s),
      id: uuid(),
      layers: s.layers.map((l) => ({ ...structuredClone(l), id: uuid() }))
    })),
    audio: tpl.audio ? { ...tpl.audio } : null
  }
}
