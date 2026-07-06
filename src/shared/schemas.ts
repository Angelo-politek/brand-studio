// Runtime validation for IPC payloads. The main process parses untrusted input
// from the renderer at the boundary before it reaches the DB / filesystem.
//
// Deeply-nested editor structures (layers, pages, scenes) are produced by our
// own code and round-trip through JSON columns, so they are validated loosely
// (shape + size) rather than re-typing every optional field. The security value
// is in guarding the boundary: ids, sizes, byte lengths, and the writable-subdir
// allowlist.

import { z } from 'zod'

/** Max bytes accepted for a single binary write (256 MB) — guards against absurd payloads. */
export const MAX_BINARY_BYTES = 256 * 1024 * 1024

const bytes = z
  .instanceof(Uint8Array)
  .refine((b) => b.byteLength <= MAX_BINARY_BYTES, 'binary payload too large')

const nonEmpty = z.string().min(1)
const id = z.string().min(1).max(200)

/** Subdirectories the renderer may write into (mirror of WRITABLE_SUBDIRS in main). */
export const writableSubdir = z.enum([
  'brands',
  'projects',
  'templates',
  'assets',
  'exports',
  'planner',
  'videos',
  'cache',
  'cache/thumbs'
])

const canvasSpec = z.object({
  width: z.number().positive().max(100000),
  height: z.number().positive().max(100000),
  background: z.string()
})

// Loose validation for nested editor objects (our own serialized data).
const layer = z.object({}).passthrough()
const layers = z.array(layer)
const scene = z.object({}).passthrough()

export const saveBinaryInput = z.object({
  subdir: writableSubdir,
  filename: nonEmpty,
  bytes
})

/**
 * Exact-name write, allowing nesting BELOW an allowlisted subdir (e.g.
 * 'cache/video-export/<id>/scene_0'). Segment safety (`..`, empty) is enforced
 * in the main process; the schema just bounds shape and size.
 */
export const saveBinaryNamedInput = z.object({
  subdir: z.string().min(1).max(300),
  filename: nonEmpty.max(200),
  bytes
})

/** Asset library folders (mirror of ASSET_FOLDERS in types). */
export const assetFolder = z.enum([
  'Logos',
  'Images',
  'Backgrounds',
  'Icons',
  'Videos',
  'Audio',
  'Documents'
])

export const assetImportInput = z.object({
  brandId: id,
  folder: assetFolder,
  name: nonEmpty,
  mime: z.string(),
  bytes,
  width: z.number().nullable(),
  height: z.number().nullable(),
  thumbBytes: bytes.nullable(),
  tags: z.array(z.string())
})

export const brandCreateInput = z.object({
  name: nonEmpty,
  colors: z.array(z.object({}).passthrough()).optional(),
  fonts: z.array(z.object({}).passthrough()).optional(),
  logos: z.array(z.object({}).passthrough()).optional(),
  presets: z.array(z.object({}).passthrough()).optional()
})

export const projectCreateInput = z.object({
  brandId: id,
  name: nonEmpty,
  type: z.string(),
  canvas: canvasSpec,
  layers: layers.optional()
})

export const templateCreateInput = z.object({
  brandId: id.nullable(),
  name: nonEmpty,
  type: z.string(),
  canvas: canvasSpec,
  layers,
  variables: z.array(z.string())
})

export const exportSaveInput = z.object({
  projectId: id.nullable(),
  brandId: id.nullable(),
  format: nonEmpty,
  filename: nonEmpty,
  bytes,
  settings: z.record(z.unknown()).optional()
})

export const plannerCreateInput = z.object({
  brandId: id,
  date: nonEmpty,
  time: z.string().nullable().optional(),
  platform: z.string().nullable().optional(),
  status: z.string(),
  title: nonEmpty,
  notes: z.string().nullable().optional(),
  projectId: id.nullable().optional()
})

export const videoCreateInput = z.object({
  brandId: id,
  name: nonEmpty,
  width: z.number().positive().max(100000),
  height: z.number().positive().max(100000),
  scenes: z.array(scene).optional()
})

export const assetListQuery = z.object({
  brandId: id,
  folder: z.string().optional(),
  search: z.string().optional()
})

export const exportListQuery = z
  .object({ brandId: id.optional(), projectId: id.optional() })
  .optional()
  .nullable()

/* ------------------------------- updates ------------------------------ */
// Full-entity updates: the id and every column the repository writes must be
// present and well-typed; extra fields our own code round-trips pass through.

export const brandUpdateInput = z
  .object({
    id,
    name: nonEmpty,
    logos: z.array(z.object({}).passthrough()),
    colors: z.array(z.object({}).passthrough()),
    fonts: z.array(z.object({}).passthrough()),
    presets: z.array(z.object({}).passthrough())
  })
  .passthrough()

export const assetUpdateInput = z
  .object({
    id,
    name: nonEmpty,
    folder: assetFolder,
    tags: z.array(z.string())
  })
  .passthrough()

export const projectUpdateInput = z
  .object({
    id,
    name: nonEmpty,
    type: z.string(),
    canvas: canvasSpec,
    layers,
    pages: z.array(z.object({}).passthrough()).optional(),
    thumbPath: z.string().nullable()
  })
  .passthrough()

export const plannerUpdateInput = z
  .object({
    id,
    date: nonEmpty,
    time: z.string().nullable(),
    platform: z.string().nullable(),
    status: z.string(),
    title: nonEmpty,
    notes: z.string().nullable(),
    projectId: id.nullable()
  })
  .passthrough()

export const videoUpdateInput = z
  .object({
    id,
    name: nonEmpty,
    width: z.number().positive().max(100000),
    height: z.number().positive().max(100000),
    scenes: z.array(scene),
    audio: z.object({}).passthrough().nullable().optional(),
    thumbPath: z.string().nullable()
  })
  .passthrough()

/* ----------------------------- multi-arg ------------------------------ */

/** A bare id argument. */
export const idArg = id
/** Optional bare id (e.g. templatesList's brandId filter). */
export const optionalIdArg = id.optional().nullable()
/** (id, pngBytes) — thumbnail save handlers. */
export const saveThumbArgs = z.tuple([id, bytes])
/** (id, newName). */
export const renameArgs = z.tuple([id, nonEmpty])
/** A relative path under the data root (containment is enforced in main). */
export const relPathArg = z.string().min(1).max(2000)
/** An absolute path (must additionally pass the main-process allowlists). */
export const absPathArg = z.string().min(1).max(2000)
/** (absPath, bytes) — save-dialog-authorized write. */
export const writeFileToArgs = z.tuple([absPathArg, bytes])
