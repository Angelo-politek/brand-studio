import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { join, normalize as normalizePath } from 'path'
import { writeFile, readFile, mkdir, unlink } from 'fs/promises'
import type { ZodError, ZodSchema } from 'zod'
import { IPC } from '@shared/ipc'
import * as S from '@shared/schemas'
import type {
  AssetImportInput,
  AssetListQuery,
  BrandCreateInput,
  ExportListQuery,
  ExportSaveInput,
  OpenFileDialogOptions,
  SaveFileDialogOptions,
  PlannerCreateInput,
  ProjectCreateInput,
  TemplateCreateInput,
  VideoCreateInput
} from '@shared/ipc'
import type { Asset, Brand, ExportRecord, PlannerItem, Project, VideoProject } from '@shared/types'
import {
  getPaths,
  toAbsolute,
  toRelative,
  isUnderDataRoot,
  assertUnderDataRoot,
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
import { getStatus } from './python/status'

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
  const abs = toAbsolute(relativePath)
  // A `..`-laden path would resolve outside the data root; never delete there.
  if (!isUnderDataRoot(abs)) return
  try {
    await unlink(abs)
  } catch {
    /* already gone */
  }
}

/** Compact validation error: field paths + codes only, never payload values. */
function invalidPayload(channel: string, error: ZodError): Error {
  const summary = error.issues
    .slice(0, 3)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.code}`)
    .join('; ')
  return new Error(`Invalid payload for ${channel}: ${summary}`)
}

/**
 * Register an IPC handler whose single payload argument is validated against a
 * Zod schema before the handler runs. Invalid input rejects the invoke with a
 * structured error instead of reaching the DB / filesystem.
 */
function handleValidated<T>(
  channel: string,
  schema: ZodSchema<T>,
  fn: (input: T, e: Electron.IpcMainInvokeEvent) => unknown
): void {
  ipcMain.handle(channel, (e, raw) => {
    const parsed = schema.safeParse(raw)
    if (!parsed.success) throw invalidPayload(channel, parsed.error)
    return fn(parsed.data, e)
  })
}

/** Like handleValidated, for handlers invoked with multiple arguments (tuple schema). */
function handleValidatedArgs<T extends [unknown, ...unknown[]]>(
  channel: string,
  schema: ZodSchema<T>,
  fn: (args: T, e: Electron.IpcMainInvokeEvent) => unknown
): void {
  ipcMain.handle(channel, (e, ...raw) => {
    const parsed = schema.safeParse(raw)
    if (!parsed.success) throw invalidPayload(channel, parsed.error)
    return fn(parsed.data, e)
  })
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
  ipcMain.handle(IPC.appGetPythonStatus, () => getStatus())

  handleValidated(IPC.appSaveBinary, S.saveBinaryInput, (input) =>
    writeBinary(input.subdir, input.filename, input.bytes)
  )

  handleValidated(IPC.appReadFile, S.absPathArg, async (absPath) => {
    // Allow only files inside the data root or ones the user just picked via a
    // system dialog — never arbitrary paths supplied by the renderer.
    if (!isUnderDataRoot(absPath) && !dialogAllowedPaths.has(normalizePath(absPath))) {
      throw new Error('Read not allowed for this path')
    }
    const buf = await readFile(absPath)
    return new Uint8Array(buf)
  })

  handleValidated(IPC.appOpenPath, S.relPathArg, (relativePath) =>
    shell.openPath(assertUnderDataRoot(toAbsolute(relativePath)))
  )

  handleValidated(IPC.appShowInFolder, S.relPathArg, (relativePath) => {
    shell.showItemInFolder(assertUnderDataRoot(toAbsolute(relativePath)))
  })

  handleValidated(IPC.appDeleteFile, S.relPathArg, (relativePath) =>
    safeUnlinkRelative(relativePath)
  )

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

  ipcMain.handle(IPC.appSaveFileDialog, async (e, opts?: SaveFileDialogOptions) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const result = await dialog.showSaveDialog(win!, {
      defaultPath: opts?.defaultPath,
      filters: opts?.filters
    })
    if (result.canceled || !result.filePath) return null
    // Authorize a subsequent writeFileTo to exactly this path.
    dialogAllowedPaths.add(normalizePath(result.filePath))
    return result.filePath
  })

  handleValidatedArgs(IPC.appWriteFileTo, S.writeFileToArgs, async ([absPath, bytes]) => {
    // Only allow writing to a path the user just chose via the save dialog.
    if (!dialogAllowedPaths.has(normalizePath(absPath))) {
      throw new Error('Write not allowed for this path')
    }
    await writeFile(absPath, Buffer.from(bytes))
  })

  /* -------------------------------- brands ------------------------------ */
  ipcMain.handle(IPC.brandsList, () => brandsRepo.list())
  handleValidated(IPC.brandsGet, S.idArg, (id) => brandsRepo.get(id))
  handleValidated(IPC.brandsCreate, S.brandCreateInput, (input) =>
    brandsRepo.create(input as unknown as BrandCreateInput)
  )
  handleValidated(IPC.brandsUpdate, S.brandUpdateInput, (input) =>
    brandsRepo.update(input as unknown as Brand)
  )
  handleValidated(IPC.brandsDelete, S.idArg, (id) => brandsRepo.delete(id))

  /* -------------------------------- assets ------------------------------ */
  handleValidated(IPC.assetsList, S.assetListQuery, (query) =>
    assetsRepo.list(query as AssetListQuery)
  )

  handleValidated(IPC.assetsImport, S.assetImportInput, async (parsed): Promise<Asset> => {
    const input = parsed as unknown as AssetImportInput
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
    try {
      return assetsRepo.insert(asset)
    } catch (err) {
      // Roll back orphaned files if the DB insert fails.
      await safeUnlinkRelative(filePath)
      await safeUnlinkRelative(thumbPath)
      throw err
    }
  })

  handleValidated(IPC.assetsUpdate, S.assetUpdateInput, (input) =>
    assetsRepo.update(input as unknown as Asset)
  )

  handleValidated(IPC.assetsDelete, S.idArg, async (id) => {
    const asset = assetsRepo.get(id)
    if (asset) {
      await safeUnlinkRelative(asset.filePath)
      await safeUnlinkRelative(asset.thumbPath)
    }
    assetsRepo.delete(id)
  })

  /* ------------------------------- projects ----------------------------- */
  handleValidated(IPC.projectsList, S.idArg, (brandId) => projectsRepo.list(brandId))
  handleValidated(IPC.projectsGet, S.idArg, (id) => projectsRepo.get(id))
  handleValidated(IPC.projectsCreate, S.projectCreateInput, (input) =>
    projectsRepo.create(input as unknown as ProjectCreateInput)
  )
  handleValidated(IPC.projectsUpdate, S.projectUpdateInput, (input) =>
    projectsRepo.update(input as unknown as Project)
  )
  handleValidatedArgs(IPC.projectsSaveThumb, S.saveThumbArgs, async ([id, bytes]) => {
    const rel = await writeBinaryNamed('projects', `${id}.png`, bytes)
    projectsRepo.setThumb(id, rel)
    return rel
  })
  handleValidated(IPC.projectsDelete, S.idArg, async (id) => {
    const project = projectsRepo.get(id)
    if (project) await safeUnlinkRelative(project.thumbPath)
    projectsRepo.delete(id)
  })

  /* ------------------------------ templates ----------------------------- */
  handleValidated(IPC.templatesList, S.optionalIdArg, (brandId) =>
    templatesRepo.list(brandId ?? undefined)
  )
  handleValidated(IPC.templatesGet, S.idArg, (id) => templatesRepo.get(id))
  handleValidated(IPC.templatesCreate, S.templateCreateInput, (input) =>
    templatesRepo.create(input as unknown as TemplateCreateInput)
  )
  handleValidatedArgs(IPC.templatesSaveThumb, S.saveThumbArgs, async ([id, bytes]) => {
    const rel = await writeBinaryNamed('templates', `${id}.png`, bytes)
    templatesRepo.setThumb(id, rel)
    return rel
  })
  handleValidatedArgs(IPC.templatesRename, S.renameArgs, ([id, name]) =>
    templatesRepo.rename(id, name)
  )
  handleValidated(IPC.templatesDelete, S.idArg, (id) => templatesRepo.delete(id))

  /* ------------------------------- exports ------------------------------ */
  handleValidated(IPC.exportsList, S.exportListQuery, (query) =>
    exportsRepo.list((query ?? undefined) as ExportListQuery | undefined)
  )

  /* ------------------------------- planner ------------------------------ */
  handleValidated(IPC.plannerList, S.idArg, (brandId) => plannerRepo.list(brandId))
  handleValidated(IPC.plannerCreate, S.plannerCreateInput, (input) =>
    plannerRepo.create(input as PlannerCreateInput)
  )
  handleValidated(IPC.plannerUpdate, S.plannerUpdateInput, (input) =>
    plannerRepo.update(input as unknown as PlannerItem)
  )
  handleValidated(IPC.plannerDelete, S.idArg, (id) => plannerRepo.delete(id))

  /* ------------------------------- video -------------------------------- */
  handleValidated(IPC.videoList, S.idArg, (brandId) => videoRepo.list(brandId))
  handleValidated(IPC.videoGet, S.idArg, (id) => videoRepo.get(id))
  handleValidated(IPC.videoCreate, S.videoCreateInput, (input) =>
    videoRepo.create(input as VideoCreateInput)
  )
  handleValidated(IPC.videoUpdate, S.videoUpdateInput, (input) =>
    videoRepo.update(input as unknown as VideoProject)
  )
  handleValidated(IPC.videoDelete, S.idArg, async (id) => {
    const vp = videoRepo.get(id)
    if (vp) await safeUnlinkRelative(vp.thumbPath)
    videoRepo.delete(id)
  })
  handleValidatedArgs(IPC.videoSaveThumb, S.saveThumbArgs, async ([id, bytes]) => {
    const rel = await writeBinaryNamed('videos', `${id}.png`, bytes)
    videoRepo.setThumb(id, rel)
    return rel
  })

  handleValidated(IPC.exportsSave, S.exportSaveInput, async (parsed): Promise<ExportRecord> => {
    const input = parsed as ExportSaveInput
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
    try {
      return exportsRepo.insert(record)
    } catch (err) {
      // Roll back the orphaned file if the DB insert fails.
      await safeUnlinkRelative(filePath)
      throw err
    }
  })
}
