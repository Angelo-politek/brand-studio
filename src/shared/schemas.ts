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

export const assetImportInput = z.object({
  brandId: id,
  folder: nonEmpty,
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

/** A bare id argument. */
export const idArg = id
