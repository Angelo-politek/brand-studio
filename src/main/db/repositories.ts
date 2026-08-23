import { randomUUID } from 'crypto'
import { getDb } from './connection'
import type {
  Asset,
  Brand,
  ExportRecord,
  Page,
  PlannerItem,
  Project,
  Template,
  VideoProject
} from '@shared/types'
import type {
  AssetListQuery,
  BrandCreateInput,
  ExportListQuery,
  PlannerCreateInput,
  ProjectCreateInput,
  TemplateCreateInput,
  VideoCreateInput
} from '@shared/ipc'

const now = (): number => Date.now()
const uid = (): string => randomUUID()

/**
 * Parse a JSON column, returning `fallback` (and logging) instead of throwing on
 * a corrupt value — one bad row must not break an entire list() query.
 */
export function safeJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string') return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    console.warn('[db] failed to parse JSON column, using fallback:', raw?.slice?.(0, 120))
    return fallback
  }
}

/* ------------------------------- Brands ------------------------------ */

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapBrand(row: any): Brand {
  return {
    id: row.id,
    name: row.name,
    logos: safeJson(row.logos, []),
    colors: safeJson(row.colors, []),
    fonts: safeJson(row.fonts, []),
    presets: safeJson(row.presets, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export const brandsRepo = {
  list(): Brand[] {
    return getDb().prepare('SELECT * FROM brands ORDER BY updated_at DESC').all().map(mapBrand)
  },
  get(id: string): Brand | null {
    const row = getDb().prepare('SELECT * FROM brands WHERE id = ?').get(id)
    return row ? mapBrand(row) : null
  },
  create(input: BrandCreateInput): Brand {
    const ts = now()
    const brand: Brand = {
      id: uid(),
      name: input.name,
      logos: input.logos ?? [],
      colors: input.colors ?? [],
      fonts: input.fonts ?? [],
      presets: input.presets ?? [],
      createdAt: ts,
      updatedAt: ts
    }
    getDb()
      .prepare(
        `INSERT INTO brands (id, name, logos, colors, fonts, presets, created_at, updated_at)
         VALUES (@id, @name, @logos, @colors, @fonts, @presets, @createdAt, @updatedAt)`
      )
      .run({
        ...brand,
        logos: JSON.stringify(brand.logos),
        colors: JSON.stringify(brand.colors),
        fonts: JSON.stringify(brand.fonts),
        presets: JSON.stringify(brand.presets)
      })
    return brand
  },
  update(brand: Brand): Brand {
    const updated = { ...brand, updatedAt: now() }
    getDb()
      .prepare(
        `UPDATE brands SET name=@name, logos=@logos, colors=@colors, fonts=@fonts,
         presets=@presets, updated_at=@updatedAt WHERE id=@id`
      )
      .run({
        ...updated,
        logos: JSON.stringify(updated.logos),
        colors: JSON.stringify(updated.colors),
        fonts: JSON.stringify(updated.fonts),
        presets: JSON.stringify(updated.presets)
      })
    return updated
  },
  delete(id: string): void {
    getDb().prepare('DELETE FROM brands WHERE id = ?').run(id)
  }
}

/* ------------------------------- Assets ------------------------------ */

function mapAsset(row: any): Asset {
  return {
    id: row.id,
    brandId: row.brand_id,
    name: row.name,
    folder: row.folder,
    filePath: row.file_path,
    thumbPath: row.thumb_path,
    tags: safeJson(row.tags, []),
    mime: row.mime,
    width: row.width,
    height: row.height,
    size: row.size,
    createdAt: row.created_at
  }
}

export const assetsRepo = {
  list(query: AssetListQuery): Asset[] {
    const clauses = ['brand_id = @brandId']
    const params: Record<string, unknown> = { brandId: query.brandId }
    if (query.folder) {
      clauses.push('folder = @folder')
      params.folder = query.folder
    }
    if (query.search && query.search.trim()) {
      clauses.push('(name LIKE @search OR tags LIKE @search)')
      params.search = `%${query.search.trim()}%`
    }
    return getDb()
      .prepare(`SELECT * FROM assets WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC`)
      .all(params)
      .map(mapAsset)
  },
  get(id: string): Asset | null {
    const row = getDb().prepare('SELECT * FROM assets WHERE id = ?').get(id)
    return row ? mapAsset(row) : null
  },
  insert(asset: Asset): Asset {
    getDb()
      .prepare(
        `INSERT INTO assets (id, brand_id, name, folder, file_path, thumb_path, tags, mime, width, height, size, created_at)
         VALUES (@id, @brandId, @name, @folder, @filePath, @thumbPath, @tags, @mime, @width, @height, @size, @createdAt)`
      )
      .run({ ...asset, tags: JSON.stringify(asset.tags) })
    return asset
  },
  update(asset: Asset): Asset {
    getDb()
      .prepare(`UPDATE assets SET name=@name, folder=@folder, tags=@tags WHERE id=@id`)
      .run({ ...asset, tags: JSON.stringify(asset.tags) })
    return asset
  },
  delete(id: string): void {
    getDb().prepare('DELETE FROM assets WHERE id = ?').run(id)
  }
}

/* ------------------------------ Projects ----------------------------- */

function mapProject(row: any): Project {
  let pages: Page[] | undefined
  if (row.pages) {
    const parsed = safeJson<Page[] | null>(row.pages, null)
    if (parsed) pages = parsed
  }
  const canvas = safeJson(row.canvas, { width: 1080, height: 1080, background: '#ffffff' })
  const layers = safeJson(row.layers, [])
  // If pages column is missing or empty, synthesize a single page from canvas/layers.
  if (!pages || pages.length === 0) {
    pages = [{ id: randomUUID(), name: 'Page 1', canvas, layers }]
  }
  return {
    id: row.id,
    brandId: row.brand_id,
    name: row.name,
    type: row.type,
    canvas: pages[0].canvas,
    layers: pages[0].layers,
    pages,
    thumbPath: row.thumb_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export const projectsRepo = {
  list(brandId: string): Project[] {
    return getDb()
      .prepare('SELECT * FROM projects WHERE brand_id = ? ORDER BY updated_at DESC')
      .all(brandId)
      .map(mapProject)
  },
  get(id: string): Project | null {
    const row = getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id)
    return row ? mapProject(row) : null
  },
  create(input: ProjectCreateInput): Project {
    const ts = now()
    const project: Project = {
      id: uid(),
      brandId: input.brandId,
      name: input.name,
      type: input.type,
      canvas: input.canvas,
      layers: input.layers ?? [],
      thumbPath: null,
      createdAt: ts,
      updatedAt: ts
    }
    getDb()
      .prepare(
        `INSERT INTO projects (id, brand_id, name, type, canvas, layers, thumb_path, created_at, updated_at)
         VALUES (@id, @brandId, @name, @type, @canvas, @layers, @thumbPath, @createdAt, @updatedAt)`
      )
      .run({
        ...project,
        canvas: JSON.stringify(project.canvas),
        layers: JSON.stringify(project.layers)
      })
    return project
  },
  update(project: Project): Project {
    const updated = { ...project, updatedAt: now() }
    // Derive first-page canvas/layers for backward compat columns.
    const firstPage = updated.pages?.[0]
    const canvas = firstPage?.canvas ?? updated.canvas
    const layers = firstPage?.layers ?? updated.layers
    getDb()
      .prepare(
        `UPDATE projects SET name=@name, type=@type, canvas=@canvas, layers=@layers,
         pages=@pages, thumb_path=@thumbPath, updated_at=@updatedAt WHERE id=@id`
      )
      .run({
        id: updated.id,
        name: updated.name,
        type: updated.type,
        canvas: JSON.stringify(canvas),
        layers: JSON.stringify(layers),
        pages: updated.pages ? JSON.stringify(updated.pages) : null,
        thumbPath: updated.thumbPath,
        updatedAt: updated.updatedAt
      })
    return updated
  },
  setThumb(id: string, thumbPath: string): void {
    getDb().prepare('UPDATE projects SET thumb_path = ? WHERE id = ?').run(thumbPath, id)
  },
  delete(id: string): void {
    getDb().prepare('DELETE FROM projects WHERE id = ?').run(id)
  }
}

/* ------------------------------ Templates ---------------------------- */

function mapTemplate(row: any): Template {
  return {
    id: row.id,
    brandId: row.brand_id,
    name: row.name,
    type: row.type,
    canvas: safeJson(row.canvas, { width: 1080, height: 1080, background: '#ffffff' }),
    layers: safeJson(row.layers, []),
    variables: safeJson(row.variables, []),
    thumbPath: row.thumb_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export const templatesRepo = {
  list(brandId?: string): Template[] {
    const db = getDb()
    if (brandId) {
      // brand-specific templates plus global (brand_id IS NULL) ones
      return db
        .prepare(
          'SELECT * FROM templates WHERE brand_id = ? OR brand_id IS NULL ORDER BY updated_at DESC'
        )
        .all(brandId)
        .map(mapTemplate)
    }
    return db.prepare('SELECT * FROM templates ORDER BY updated_at DESC').all().map(mapTemplate)
  },
  get(id: string): Template | null {
    const row = getDb().prepare('SELECT * FROM templates WHERE id = ?').get(id)
    return row ? mapTemplate(row) : null
  },
  create(input: TemplateCreateInput): Template {
    const ts = now()
    const tpl: Template = {
      id: uid(),
      brandId: input.brandId,
      name: input.name,
      type: input.type,
      canvas: input.canvas,
      layers: input.layers,
      variables: input.variables,
      thumbPath: null,
      createdAt: ts,
      updatedAt: ts
    }
    getDb()
      .prepare(
        `INSERT INTO templates (id, brand_id, name, type, canvas, layers, variables, thumb_path, created_at, updated_at)
         VALUES (@id, @brandId, @name, @type, @canvas, @layers, @variables, @thumbPath, @createdAt, @updatedAt)`
      )
      .run({
        ...tpl,
        canvas: JSON.stringify(tpl.canvas),
        layers: JSON.stringify(tpl.layers),
        variables: JSON.stringify(tpl.variables)
      })
    return tpl
  },
  setThumb(id: string, thumbPath: string): void {
    getDb().prepare('UPDATE templates SET thumb_path = ? WHERE id = ?').run(thumbPath, id)
  },
  rename(id: string, name: string): void {
    getDb()
      .prepare('UPDATE templates SET name = ?, updated_at = ? WHERE id = ?')
      .run(name, now(), id)
  },
  delete(id: string): void {
    getDb().prepare('DELETE FROM templates WHERE id = ?').run(id)
  }
}

/* ------------------------------ Exports ------------------------------ */

function mapExport(row: any): ExportRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    brandId: row.brand_id,
    format: row.format,
    filePath: row.file_path,
    settings: safeJson(row.settings, {}),
    createdAt: row.created_at
  }
}

export const exportsRepo = {
  list(query?: ExportListQuery): ExportRecord[] {
    const clauses: string[] = []
    const params: Record<string, unknown> = {}
    if (query?.brandId) {
      clauses.push('brand_id = @brandId')
      params.brandId = query.brandId
    }
    if (query?.projectId) {
      clauses.push('project_id = @projectId')
      params.projectId = query.projectId
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    return getDb()
      .prepare(`SELECT * FROM exports ${where} ORDER BY created_at DESC`)
      .all(params)
      .map(mapExport)
  },
  insert(record: ExportRecord): ExportRecord {
    getDb()
      .prepare(
        `INSERT INTO exports (id, project_id, brand_id, format, file_path, settings, created_at)
         VALUES (@id, @projectId, @brandId, @format, @filePath, @settings, @createdAt)`
      )
      .run({ ...record, settings: JSON.stringify(record.settings) })
    return record
  },
  /**
   * `exports.brand_id` carries no FK constraint (a brand can be deleted while
   * an export record is kept queryable elsewhere), so nothing cascades these
   * rows away automatically — brand deletion must remove them explicitly.
   */
  deleteByBrand(brandId: string): void {
    getDb().prepare('DELETE FROM exports WHERE brand_id = ?').run(brandId)
  }
}

/* ------------------------------ Planner ------------------------------ */

function mapPlanner(row: any): PlannerItem {
  return {
    id: row.id,
    brandId: row.brand_id,
    date: row.date,
    time: row.time,
    platform: row.platform,
    status: row.status,
    title: row.title,
    notes: row.notes,
    projectId: row.project_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export const plannerRepo = {
  list(brandId: string): PlannerItem[] {
    return getDb()
      .prepare('SELECT * FROM planner WHERE brand_id = ? ORDER BY date ASC, time ASC')
      .all(brandId)
      .map(mapPlanner)
  },
  create(input: PlannerCreateInput): PlannerItem {
    const ts = now()
    const item: PlannerItem = {
      id: uid(),
      brandId: input.brandId,
      date: input.date,
      time: input.time ?? null,
      platform: input.platform ?? null,
      status: input.status,
      title: input.title,
      notes: input.notes ?? null,
      projectId: input.projectId ?? null,
      createdAt: ts,
      updatedAt: ts
    }
    getDb()
      .prepare(
        `INSERT INTO planner (id, brand_id, date, time, platform, status, title, notes, project_id, created_at, updated_at)
         VALUES (@id, @brandId, @date, @time, @platform, @status, @title, @notes, @projectId, @createdAt, @updatedAt)`
      )
      .run(item)
    return item
  },
  update(item: PlannerItem): PlannerItem {
    const updated = { ...item, updatedAt: now() }
    getDb()
      .prepare(
        `UPDATE planner SET date=@date, time=@time, platform=@platform, status=@status,
         title=@title, notes=@notes, project_id=@projectId, updated_at=@updatedAt WHERE id=@id`
      )
      .run(updated)
    return updated
  },
  delete(id: string): void {
    getDb().prepare('DELETE FROM planner WHERE id = ?').run(id)
  }
}

/* --------------------------- Video projects -------------------------- */

function mapVideo(row: any): VideoProject {
  const scenesRaw = safeJson(row.scenes, [] as VideoProject['scenes'])
  const audio = row.audio ? safeJson(row.audio, null) : null

  // Migrate legacy single-clip projects (pre-v2) into a single scene so they
  // open cleanly in the timeline editor.
  let scenes = scenesRaw
  if (scenes.length === 0 && row.source_path) {
    const trimStart = row.trim_start ?? 0
    const trimEnd = row.trim_end || row.duration || 0
    const durationMs = Math.max(0, trimEnd - trimStart) * 1000
    scenes = [
      {
        id: uid(),
        name: 'Scene 1',
        durationMs: durationMs || 4000,
        background: '#000000',
        clip: {
          src: row.source_path,
          inMs: trimStart * 1000,
          outMs: trimEnd * 1000,
          sourceDurMs: (row.duration || trimEnd) * 1000,
          volume: 1,
          muted: false,
          fit: 'cover',
          look: row.look ?? 'none',
          x: 0,
          y: 0,
          width: row.width,
          height: row.height,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          opacity: 1,
          crop: null
        },
        layers: safeJson(row.overlays, [])
      }
    ]
  }

  return {
    id: row.id,
    brandId: row.brand_id,
    name: row.name,
    width: row.width,
    height: row.height,
    scenes,
    audio,
    thumbPath: row.thumb_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export const videoRepo = {
  list(brandId: string): VideoProject[] {
    return getDb()
      .prepare('SELECT * FROM video_projects WHERE brand_id = ? ORDER BY updated_at DESC')
      .all(brandId)
      .map(mapVideo)
  },
  get(id: string): VideoProject | null {
    const row = getDb().prepare('SELECT * FROM video_projects WHERE id = ?').get(id)
    return row ? mapVideo(row) : null
  },
  create(input: VideoCreateInput): VideoProject {
    const ts = now()
    const scenes: VideoProject['scenes'] =
      input.scenes && input.scenes.length > 0
        ? input.scenes
        : [
            {
              id: uid(),
              name: 'Scene 1',
              durationMs: 4000,
              background: '#000000',
              clip: null,
              layers: []
            }
          ]
    const vp: VideoProject = {
      id: uid(),
      brandId: input.brandId,
      name: input.name,
      width: input.width,
      height: input.height,
      scenes,
      audio: null,
      thumbPath: null,
      createdAt: ts,
      updatedAt: ts
    }
    getDb()
      .prepare(
        `INSERT INTO video_projects
           (id, brand_id, name, source_path, width, height, duration, trim_start, trim_end,
            overlays, captions, look, scenes, audio, thumb_path, created_at, updated_at)
         VALUES
           (@id, @brandId, @name, '', @width, @height, 0, 0, 0,
            '[]', '[]', 'none', @scenes, @audio, @thumbPath, @createdAt, @updatedAt)`
      )
      .run({
        id: vp.id,
        brandId: vp.brandId,
        name: vp.name,
        width: vp.width,
        height: vp.height,
        scenes: JSON.stringify(vp.scenes),
        audio: JSON.stringify(vp.audio),
        thumbPath: vp.thumbPath,
        createdAt: vp.createdAt,
        updatedAt: vp.updatedAt
      })
    return vp
  },
  update(vp: VideoProject): VideoProject {
    const updated = { ...vp, updatedAt: now() }
    getDb()
      .prepare(
        `UPDATE video_projects SET name=@name, width=@width, height=@height,
         scenes=@scenes, audio=@audio, thumb_path=@thumbPath, updated_at=@updatedAt WHERE id=@id`
      )
      .run({
        id: updated.id,
        name: updated.name,
        width: updated.width,
        height: updated.height,
        scenes: JSON.stringify(updated.scenes),
        audio: JSON.stringify(updated.audio ?? null),
        thumbPath: updated.thumbPath,
        updatedAt: updated.updatedAt
      })
    return updated
  },
  setThumb(id: string, thumbPath: string): void {
    getDb().prepare('UPDATE video_projects SET thumb_path = ? WHERE id = ?').run(thumbPath, id)
  },
  delete(id: string): void {
    getDb().prepare('DELETE FROM video_projects WHERE id = ?').run(id)
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
