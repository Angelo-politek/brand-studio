import type {
  Asset,
  AssetFolder,
  Brand,
  BrandColor,
  BrandFont,
  BrandLogo,
  CanvasSpec,
  ExportPreset,
  ExportRecord,
  Layer,
  PlannerItem,
  PlannerStatus,
  Project,
  Template,
  VideoProject,
  VideoScene
} from './types'

/** IPC channel names. Shared by preload (invoke) and main (handle). */
export const IPC = {
  appGetPaths: 'app:getPaths',
  appGetPythonPort: 'app:getPythonPort',
  appGetPythonInfo: 'app:getPythonInfo',
  appSaveBinary: 'app:saveBinary',
  appOpenFileDialog: 'app:openFileDialog',
  appReadFile: 'app:readFile',
  appOpenPath: 'app:openPath',
  appShowInFolder: 'app:showInFolder',
  appDeleteFile: 'app:deleteFile',

  brandsList: 'brands:list',
  brandsGet: 'brands:get',
  brandsCreate: 'brands:create',
  brandsUpdate: 'brands:update',
  brandsDelete: 'brands:delete',

  assetsList: 'assets:list',
  assetsImport: 'assets:import',
  assetsUpdate: 'assets:update',
  assetsDelete: 'assets:delete',

  projectsList: 'projects:list',
  projectsGet: 'projects:get',
  projectsCreate: 'projects:create',
  projectsUpdate: 'projects:update',
  projectsDelete: 'projects:delete',
  projectsSaveThumb: 'projects:saveThumb',

  templatesList: 'templates:list',
  templatesGet: 'templates:get',
  templatesCreate: 'templates:create',
  templatesDelete: 'templates:delete',
  templatesSaveThumb: 'templates:saveThumb',

  exportsList: 'exports:list',
  exportsSave: 'exports:save',

  plannerList: 'planner:list',
  plannerCreate: 'planner:create',
  plannerUpdate: 'planner:update',
  plannerDelete: 'planner:delete',

  videoList: 'video:list',
  videoGet: 'video:get',
  videoCreate: 'video:create',
  videoUpdate: 'video:update',
  videoDelete: 'video:delete',
  videoSaveThumb: 'video:saveThumb'
} as const

/** Resolved absolute data directories (created on startup). */
export interface AppPaths {
  dataRoot: string
  brands: string
  projects: string
  templates: string
  assets: string
  exports: string
  planner: string
  database: string
  cache: string
}

export interface SaveBinaryInput {
  /** Subdirectory under the data root, e.g. 'brands' or 'assets'. */
  subdir: string
  filename: string
  bytes: Uint8Array
}

export interface OpenFileDialogOptions {
  filters?: { name: string; extensions: string[] }[]
  multi?: boolean
}

export interface AssetImportInput {
  brandId: string
  folder: AssetFolder
  name: string
  mime: string
  bytes: Uint8Array
  width: number | null
  height: number | null
  thumbBytes: Uint8Array | null
  tags: string[]
}

export interface BrandCreateInput {
  name: string
  colors?: BrandColor[]
  fonts?: BrandFont[]
  logos?: BrandLogo[]
  presets?: ExportPreset[]
}

export interface ProjectCreateInput {
  brandId: string
  name: string
  type: string
  canvas: CanvasSpec
  layers?: Layer[]
}

export interface TemplateCreateInput {
  brandId: string | null
  name: string
  type: string
  canvas: CanvasSpec
  layers: Layer[]
  variables: string[]
}

export interface ExportSaveInput {
  projectId: string | null
  brandId: string | null
  format: string
  filename: string
  bytes: Uint8Array
  settings?: Record<string, unknown>
}

export interface AssetListQuery {
  brandId: string
  folder?: AssetFolder
  search?: string
}

export interface ExportListQuery {
  brandId?: string
  projectId?: string
}

export interface PlannerCreateInput {
  brandId: string
  date: string
  time?: string | null
  platform?: string | null
  status: PlannerStatus
  title: string
  notes?: string | null
  projectId?: string | null
}

export interface VideoCreateInput {
  brandId: string
  name: string
  width: number
  height: number
  /** Optional initial scenes (e.g. from a reel template). Empty = blank scene. */
  scenes?: VideoScene[]
}

/** The `window.api` surface exposed by the preload bridge. */
export interface Api {
  app: {
    getPaths(): Promise<AppPaths>
    getPythonPort(): Promise<number | null>
    getPythonInfo(): Promise<{ port: number; token: string } | null>
    saveBinary(input: SaveBinaryInput): Promise<string>
    openFileDialog(opts?: OpenFileDialogOptions): Promise<string[]>
    readFile(absPath: string): Promise<Uint8Array>
    openPath(relativePath: string): Promise<void>
    showInFolder(relativePath: string): Promise<void>
    deleteFile(relativePath: string): Promise<void>
  }
  brands: {
    list(): Promise<Brand[]>
    get(id: string): Promise<Brand | null>
    create(input: BrandCreateInput): Promise<Brand>
    update(brand: Brand): Promise<Brand>
    delete(id: string): Promise<void>
  }
  assets: {
    list(query: AssetListQuery): Promise<Asset[]>
    import(input: AssetImportInput): Promise<Asset>
    update(asset: Asset): Promise<Asset>
    delete(id: string): Promise<void>
  }
  projects: {
    list(brandId: string): Promise<Project[]>
    get(id: string): Promise<Project | null>
    create(input: ProjectCreateInput): Promise<Project>
    update(project: Project): Promise<Project>
    delete(id: string): Promise<void>
    saveThumb(id: string, bytes: Uint8Array): Promise<string>
  }
  templates: {
    list(brandId?: string): Promise<Template[]>
    get(id: string): Promise<Template | null>
    create(input: TemplateCreateInput): Promise<Template>
    delete(id: string): Promise<void>
    saveThumb(id: string, bytes: Uint8Array): Promise<string>
  }
  exports: {
    list(query?: ExportListQuery): Promise<ExportRecord[]>
    save(input: ExportSaveInput): Promise<ExportRecord>
  }
  planner: {
    list(brandId: string): Promise<PlannerItem[]>
    create(input: PlannerCreateInput): Promise<PlannerItem>
    update(item: PlannerItem): Promise<PlannerItem>
    delete(id: string): Promise<void>
  }
  video: {
    list(brandId: string): Promise<VideoProject[]>
    get(id: string): Promise<VideoProject | null>
    create(input: VideoCreateInput): Promise<VideoProject>
    update(item: VideoProject): Promise<VideoProject>
    delete(id: string): Promise<void>
    saveThumb(id: string, bytes: Uint8Array): Promise<string>
  }
}

/** Build a media:// URL for a data-root-relative path (forward slashes). */
export function mediaUrl(relativePath: string): string {
  const clean = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
  return `media://local/${clean.split('/').map(encodeURIComponent).join('/')}`
}
