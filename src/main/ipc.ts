import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { join, normalize as normalizePath } from 'path'
import { writeFile, readFile, mkdir, unlink } from 'fs/promises'
import { IPC } from '@shared/ipc'
import type {
  AssetImportInput,
  AssetListQuery,
  BrandCreateInput,
  ExportListQuery,
  ExportSaveInput,
  OpenFileDialogOptions,
  PlannerCreateInput,
  ProjectCreateInput,
  SaveBinaryInput,
  TemplateCreateInput,
  VideoCreateInput
} from '@shared/ipc'
import type { Asset, Brand, ExportRecord, PlannerItem, Project, VideoProject } from '@shared/types'
import {
  getPaths,
  toAbsolute,
  toRelative,
  isUnderDataRoot,
  WRITABLE_SUBDIRS
} from './storage/paths'
import {
  assetsRepo,
  brandsRepo,
  exportsRepo,
  plannerRepo,
  projectsRepo,
  templatesRepo,
  videoRepo
} from './db'
import { getPythonPort, getPythonInfo } from './python/manager'

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'file'
}

/** Reject any subdir the renderer is not allowed to write into. */
function assertWritableSubdir(subdir: string): void {
  if (!(WRITABLE_SUBDIRS as readonly string[]).includes(subdir)) {
    throw new Error(`Subdir not allowed: ${subdir}`)
  }
}

/** Write bytes into <subdir> under the data root, returning the relative path. */
async function writeBinary(subdir: string, filename: string, bytes: Uint8Array): Promise<string> {
  assertWritableSubdir(subdir)
  const dir = join(getPaths().dataRoot, subdir)
  await mkdir(dir, { recursive: true })
  const finalName = `${randomUUID()}-${sanitize(filename)}`
  const abs = join(dir, finalName)
  await writeFile(abs, Buffer.from(bytes))
  return toRelative(abs)
}

/** Write bytes to an exact <subdir>/<filename> (overwrites), returning the relative path. */
async function writeBinaryNamed(
  subdir: string,
  filename: string,
  bytes: Uint8Array
): Promise<string> {
  assertWritableSubdir(subdir)
  const dir = join(getPaths().dataRoot, subdir)
  await mkdir(dir, { recursive: true })
  const abs = join(dir, sanitize(filename))
  await writeFile(abs, Buffer.from(bytes))
  return toRelative(abs)
}

async function safeUnlinkRelative(relativePath: string | null): Promise<void> {
  if (!relativePath) return
  try {
    await unlink(toAbsolute(relativePath))
  } catch {
    /* already gone */
  }
}

// Absolute paths the user explicitly picked through a system file dialog.
// `appReadFile` trusts these (the user authorized them) in addition to any path
// inside the data root. Without this allowlist the renderer could read any file.
const dialogAllowedPaths = new Set<string>()

export function registerIpc(): void {
  /* --------------------------------- app -------------------------------- */
  ipcMain.handle(IPC.appGetPaths, () => getPaths())
  ipcMain.handle(IPC.appGetPythonPort, () => getPythonPort())
  ipcMain.handle(IPC.appGetPythonInfo, () => getPythonInfo())

  ipcMain.handle(IPC.appSaveBinary, (_e, input: SaveBinaryInput) =>
    writeBinary(input.subdir, input.filename, input.bytes)
  )

  ipcMain.handle(IPC.appReadFile, async (_e, absPath: string) => {
    // Allow only files inside the data root or ones the user just picked via a
    // system dialog — never arbitrary paths supplied by the renderer.
    if (!isUnderDataRoot(absPath) && !dialogAllowedPaths.has(normalizePath(absPath))) {
      throw new Error('Read not allowed for this path')
    }
    const buf = await readFile(absPath)
    return new Uint8Array(buf)
  })

  ipcMain.handle(IPC.appOpenPath, (_e, relativePath: string) =>
    shell.openPath(toAbsolute(relativePath))
  )

  ipcMain.handle(IPC.appShowInFolder, (_e, relativePath: string) => {
    shell.showItemInFolder(toAbsolute(relativePath))
  })

  ipcMain.handle(IPC.appDeleteFile, (_e, relativePath: string) => safeUnlinkRelative(relativePath))

  ipcMain.handle(IPC.appOpenFileDialog, async (e, opts?: OpenFileDialogOptions) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const properties: ('openFile' | 'multiSelections')[] = ['openFile']
    if (opts?.multi) properties.push('multiSelections')
    const result = await dialog.showOpenDialog(win!, {
      properties,
      filters: opts?.filters
    })
    if (result.canceled) return []
    // Remember these so a subsequent appReadFile on them is authorized.
    for (const p of result.filePaths) dialogAllowedPaths.add(normalizePath(p))
    return result.filePaths
  })

  /* -------------------------------- brands ------------------------------ */
  ipcMain.handle(IPC.brandsList, () => brandsRepo.list())
  ipcMain.handle(IPC.brandsGet, (_e, id: string) => brandsRepo.get(id))
  ipcMain.handle(IPC.brandsCreate, (_e, input: BrandCreateInput) => brandsRepo.create(input))
  ipcMain.handle(IPC.brandsUpdate, (_e, brand: Brand) => brandsRepo.update(brand))
  ipcMain.handle(IPC.brandsDelete, (_e, id: string) => brandsRepo.delete(id))

  /* -------------------------------- assets ------------------------------ */
  ipcMain.handle(IPC.assetsList, (_e, query: AssetListQuery) => assetsRepo.list(query))

  ipcMain.handle(IPC.assetsImport, async (_e, input: AssetImportInput): Promise<Asset> => {
    const filePath = await writeBinary('assets', input.name, input.bytes)
    let thumbPath: string | null = null
    if (input.thumbBytes) {
      thumbPath = await writeBinary('cache/thumbs', `${input.name}.png`, input.thumbBytes)
    }
    const asset: Asset = {
      id: randomUUID(),
      brandId: input.brandId,
      name: input.name,
      folder: input.folder,
      filePath,
      thumbPath,
      tags: input.tags,
      mime: input.mime,
      width: input.width,
      height: input.height,
      size: input.bytes.byteLength,
      createdAt: Date.now()
    }
    return assetsRepo.insert(asset)
  })

  ipcMain.handle(IPC.assetsUpdate, (_e, asset: Asset) => assetsRepo.update(asset))

  ipcMain.handle(IPC.assetsDelete, async (_e, id: string) => {
    const asset = assetsRepo.get(id)
    if (asset) {
      await safeUnlinkRelative(asset.filePath)
      await safeUnlinkRelative(asset.thumbPath)
    }
    assetsRepo.delete(id)
  })

  /* ------------------------------- projects ----------------------------- */
  ipcMain.handle(IPC.projectsList, (_e, brandId: string) => projectsRepo.list(brandId))
  ipcMain.handle(IPC.projectsGet, (_e, id: string) => projectsRepo.get(id))
  ipcMain.handle(IPC.projectsCreate, (_e, input: ProjectCreateInput) =>
    projectsRepo.create(input)
  )
  ipcMain.handle(IPC.projectsUpdate, (_e, project: Project) => projectsRepo.update(project))
  ipcMain.handle(IPC.projectsSaveThumb, async (_e, id: string, bytes: Uint8Array) => {
    const rel = await writeBinaryNamed('projects', `${id}.png`, bytes)
    projectsRepo.setThumb(id, rel)
    return rel
  })
  ipcMain.handle(IPC.projectsDelete, async (_e, id: string) => {
    const project = projectsRepo.get(id)
    if (project) await safeUnlinkRelative(project.thumbPath)
    projectsRepo.delete(id)
  })

  /* ------------------------------ templates ----------------------------- */
  ipcMain.handle(IPC.templatesList, (_e, brandId?: string) => templatesRepo.list(brandId))
  ipcMain.handle(IPC.templatesGet, (_e, id: string) => templatesRepo.get(id))
  ipcMain.handle(IPC.templatesCreate, (_e, input: TemplateCreateInput) =>
    templatesRepo.create(input)
  )
  ipcMain.handle(IPC.templatesSaveThumb, async (_e, id: string, bytes: Uint8Array) => {
    const rel = await writeBinaryNamed('templates', `${id}.png`, bytes)
    templatesRepo.setThumb(id, rel)
    return rel
  })
  ipcMain.handle(IPC.templatesDelete, (_e, id: string) => templatesRepo.delete(id))

  /* ------------------------------- exports ------------------------------ */
  ipcMain.handle(IPC.exportsList, (_e, query?: ExportListQuery) => exportsRepo.list(query))

  /* ------------------------------- planner ------------------------------ */
  ipcMain.handle(IPC.plannerList, (_e, brandId: string) => plannerRepo.list(brandId))
  ipcMain.handle(IPC.plannerCreate, (_e, input: PlannerCreateInput) => plannerRepo.create(input))
  ipcMain.handle(IPC.plannerUpdate, (_e, item: PlannerItem) => plannerRepo.update(item))
  ipcMain.handle(IPC.plannerDelete, (_e, id: string) => plannerRepo.delete(id))

  /* ------------------------------- video -------------------------------- */
  ipcMain.handle(IPC.videoList, (_e, brandId: string) => videoRepo.list(brandId))
  ipcMain.handle(IPC.videoGet, (_e, id: string) => videoRepo.get(id))
  ipcMain.handle(IPC.videoCreate, (_e, input: VideoCreateInput) => videoRepo.create(input))
  ipcMain.handle(IPC.videoUpdate, (_e, vp: VideoProject) => videoRepo.update(vp))
  ipcMain.handle(IPC.videoDelete, async (_e, id: string) => {
    const vp = videoRepo.get(id)
    if (vp) await safeUnlinkRelative(vp.thumbPath)
    videoRepo.delete(id)
  })
  ipcMain.handle(IPC.videoSaveThumb, async (_e, id: string, bytes: Uint8Array) => {
    const rel = await writeBinaryNamed('videos', `${id}.png`, bytes)
    videoRepo.setThumb(id, rel)
    return rel
  })

  ipcMain.handle(IPC.exportsSave, async (_e, input: ExportSaveInput): Promise<ExportRecord> => {
    const filePath = await writeBinary('exports', input.filename, input.bytes)
    const record: ExportRecord = {
      id: randomUUID(),
      projectId: input.projectId,
      brandId: input.brandId,
      format: input.format,
      filePath,
      settings: input.settings ?? {},
      createdAt: Date.now()
    }
    return exportsRepo.insert(record)
  })
}
