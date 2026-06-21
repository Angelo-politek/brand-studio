// Domain models shared between the main process (DB + IPC) and the renderer.
// These are persisted as rows in SQLite; nested arrays are stored as JSON columns.

export type ID = string

/* ------------------------------- Brand ------------------------------- */

export type BrandColorRole = 'primary' | 'secondary' | 'accent'

export interface BrandColor {
  id: string
  role: BrandColorRole
  hex: string
  name?: string
}

export type BrandFontRole = 'heading' | 'body' | 'alt'

export interface BrandFont {
  role: BrandFontRole
  family: string
  /** Relative path under the data root for an imported custom font, else null. */
  filePath?: string | null
}

export type BrandLogoType = 'main' | 'white' | 'dark' | 'icon'

export interface BrandLogo {
  type: BrandLogoType
  /** Relative path under the data root. */
  filePath: string
  format: string
}

export type ExportFormat = 'png' | 'jpg' | 'webp' | 'pdf' | 'mp4'

export interface ExportPreset {
  id: string
  name: string
  format: ExportFormat
  scale?: number
  quality?: number
}

export interface Brand {
  id: ID
  name: string
  logos: BrandLogo[]
  colors: BrandColor[]
  fonts: BrandFont[]
  presets: ExportPreset[]
  createdAt: number
  updatedAt: number
}

/* ------------------------------- Assets ------------------------------ */

export type AssetFolder =
  | 'Logos'
  | 'Images'
  | 'Backgrounds'
  | 'Icons'
  | 'Videos'
  | 'Audio'
  | 'Documents'

export const ASSET_FOLDERS: AssetFolder[] = [
  'Logos',
  'Images',
  'Backgrounds',
  'Icons',
  'Videos',
  'Audio',
  'Documents'
]

export interface Asset {
  id: ID
  brandId: ID
  name: string
  folder: AssetFolder
  /** Relative path under the data root. Use mediaUrl() to display. */
  filePath: string
  thumbPath: string | null
  tags: string[]
  mime: string
  width: number | null
  height: number | null
  size: number
  createdAt: number
}

/* ------------------------------ Projects ----------------------------- */

export interface CanvasSpec {
  width: number
  height: number
  /** hex string, or 'transparent'. */
  background: string
}

export type LayerType =
  | 'text'
  | 'rect'
  | 'circle'
  | 'triangle'
  | 'polygon'
  | 'line'
  | 'arrow'
  | 'image'
  | 'group'

/**
 * Serialized canvas object. A loose superset of properties across layer types;
 * the editor reads only the fields relevant to each `type`.
 */
export interface Layer {
  id: string
  type: LayerType
  name: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  scaleX: number
  scaleY: number
  opacity: number
  visible: boolean
  locked: boolean

  // text
  text?: string
  fontFamily?: string
  fontSize?: number
  fontStyle?: string
  fill?: string
  align?: 'left' | 'center' | 'right'
  letterSpacing?: number
  lineHeight?: number
  strokeColor?: string
  strokeWidth?: number
  shadowColor?: string
  shadowBlur?: number
  shadowOffsetX?: number
  shadowOffsetY?: number

  // shapes
  cornerRadius?: number
  sides?: number
  points?: number[]
  pointerLength?: number
  pointerWidth?: number

  // image
  /** Relative path under the data root, resolved via mediaUrl(). */
  src?: string
  crop?: { x: number; y: number; width: number; height: number } | null
  filters?: {
    brightness?: number
    contrast?: number
    saturation?: number
    blur?: number
    grayscale?: boolean
  }
  /** Semi-transparent color overlay rendered on top of the image. */
  colorOverlay?: {
    hex: string
    opacity: number
    blendMode: 'multiply' | 'overlay' | 'color'
  } | null

  /** Enter/exit animation (used by the video editor; ignored by design editor). */
  anim?: LayerAnimation
}

/** Per-layer enter/exit animation for video overlays. */
export interface LayerAnimation {
  in?: 'none' | 'fadeIn' | 'slideUp' | 'pop'
  out?: 'none' | 'fadeOut'
  /** Animation duration in milliseconds (applies to both in and out). */
  durationMs?: number
}

export interface Page {
  id: string
  name: string
  canvas: CanvasSpec
  layers: Layer[]
}

export interface Project {
  id: ID
  brandId: ID
  name: string
  type: string
  /** Active-page canvas (mirrors pages[activeIndex].canvas for backward compat). */
  canvas: CanvasSpec
  /** Active-page layers (mirrors pages[activeIndex].layers for backward compat). */
  layers: Layer[]
  /** All pages. When present, takes precedence over canvas/layers. */
  pages?: Page[]
  thumbPath: string | null
  createdAt: number
  updatedAt: number
}

/* ------------------------------ Templates ---------------------------- */

export interface Template {
  id: ID
  /** null = global (brand-agnostic) template. */
  brandId: ID | null
  name: string
  type: string
  canvas: CanvasSpec
  layers: Layer[]
  /** Variable names referenced as {{NAME}} in text layers. */
  variables: string[]
  thumbPath: string | null
  createdAt: number
  updatedAt: number
}

/* ------------------------------ Planner ------------------------------ */

export type PlannerStatus = 'Idea' | 'Draft' | 'Ready' | 'Scheduled' | 'Published'

export interface PlannerItem {
  id: ID
  brandId: ID
  date: string
  time: string | null
  platform: string | null
  status: PlannerStatus
  title: string
  notes: string | null
  projectId: ID | null
  createdAt: number
  updatedAt: number
}

/* ------------------------------ Exports ------------------------------ */

export interface ExportRecord {
  id: ID
  projectId: ID | null
  brandId: ID | null
  format: string
  filePath: string
  settings: Record<string, unknown>
  createdAt: number
}

/* ------------------------------- Video ------------------------------- */

export interface Caption {
  id: string
  start: number
  end: number
  text: string
}

export type VideoLook = 'none' | 'warm' | 'cool' | 'bw' | 'contrast' | 'brand'

/* ---- Timeline model (video v2) ---- */

/** A video clip placed inside a scene, manipulable like an image layer. */
export interface VideoClip {
  /** Relative path to the source clip under the data root. */
  src: string
  /** Trim in/out of the source segment, in milliseconds. */
  inMs: number
  outMs: number
  /** Full source duration in ms (for the trim UI). */
  sourceDurMs?: number
  /** Audio volume 0..1. */
  volume: number
  muted: boolean
  /** How the clip fills its box. */
  fit: 'cover' | 'contain'
  /** Color look applied to the clip. */
  look?: VideoLook

  /** Geometry within the scene frame (defaults: full frame). Like a Layer. */
  x: number
  y: number
  width: number
  height: number
  rotation: number
  scaleX: number
  scaleY: number
  opacity: number
  /** Source-pixel crop region, or null. */
  crop?: { x: number; y: number; width: number; height: number } | null
  /** Natural pixel size of the source (for crop math). */
  naturalWidth?: number
  naturalHeight?: number
}

export type SceneTransitionType = 'none' | 'fade' | 'slideLeft' | 'slideUp'

export interface SceneTransition {
  type: SceneTransitionType
  durationMs: number
}

/** One scene of the timeline: an editable canvas with a duration. */
export interface VideoScene {
  id: string
  name: string
  /** Scene duration in milliseconds. */
  durationMs: number
  /** Hex color or 'transparent'. */
  background: string
  /** Optional full-frame background video clip. */
  clip?: VideoClip | null
  /** Editable overlays (text/image/shape), reusing the design Layer model. */
  layers: Layer[]
  /** Transition into this scene from the previous one. */
  transitionIn?: SceneTransition
}

/** Global background music track (single track in this phase). */
export interface AudioTrack {
  /** Relative path under the data root. */
  src: string
  inMs: number
  volume: number
}

export interface VideoProject {
  id: ID
  brandId: ID
  name: string
  width: number
  height: number
  /** Timeline scenes (video v2). */
  scenes: VideoScene[]
  /** Global background music, or null. */
  audio?: AudioTrack | null
  thumbPath: string | null
  createdAt: number
  updatedAt: number

  /* ---- Legacy single-clip fields (pre-v2). Kept optional for migration. ---- */
  sourcePath?: string
  duration?: number
  trimStart?: number
  trimEnd?: number
  overlays?: Layer[]
  captions?: Caption[]
  look?: VideoLook
}
