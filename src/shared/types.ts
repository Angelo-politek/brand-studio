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
  | 'panelComponent'
  | 'icon'

/** Hardware front-panel component kinds (music-gear mockups). */
export type PanelComponentKind =
  | 'knob'
  | 'encoder'
  | 'fader'
  | 'jack'
  | 'led'
  | 'toggle'
  | 'pushbutton'
  | 'screw'
  | 'display7seg'
  | 'displayOled'

/** Parametric styling for a panelComponent layer. */
export interface PanelComponentParams {
  /** Main body color (knob cap, fader handle, button face). */
  color?: string
  /** Accent color (indicator, LED light, display glyphs). */
  accent?: string
  /** Normalized value 0..1 (knob rotation, fader position, toggle up/down). */
  value?: number
  /** Tick marks around knobs / fader lanes (0 = none). */
  ticks?: number
  /** LED / pushbutton lit state. */
  on?: boolean
  /** Display text (7-segment / OLED kinds). */
  text?: string
}

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
  /**
   * Flat grouping: layers sharing a groupId select/move together. The array
   * stays flat (no nesting) so undo, export and z-order paths are untouched.
   */
  groupId?: string

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
    /** Hue rotation in degrees (-180..180). */
    hue?: number
    /** Color temperature (-1 cold .. 1 warm). */
    temperature?: number
    blur?: number
    grayscale?: boolean
  }
  /** Semi-transparent color overlay rendered on top of the image. */
  colorOverlay?: {
    hex: string
    opacity: number
    blendMode: 'multiply' | 'overlay' | 'color'
  } | null

  /** Two-stop gradient fill (overrides `fill` on shapes/text when present). */
  gradient?: {
    type: 'linear' | 'radial'
    from: string
    to: string
    /** Linear direction in degrees (0 = left→right). Ignored for radial. */
    angle?: number
  } | null

  /** Compositing mode against the layers below (default 'source-over'). */
  blendMode?: BlendMode

  /** Non-rectangular clip for images. */
  mask?: 'none' | 'circle'

  /** Enter/exit animation (used by the video editor; ignored by design editor). */
  anim?: LayerAnimation

  // panelComponent (hardware mockups)
  component?: {
    kind: PanelComponentKind
    params: PanelComponentParams
  }

  // icon (Lucide vector, recolored by `fill`)
  icon?: { name: string }
}

/** Konva globalCompositeOperation subset exposed as per-layer blend modes. */
export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'difference'

export type LayerAnimationIn =
  | 'none'
  | 'fadeIn'
  | 'slideUp'
  | 'slideDown'
  | 'slideLeft'
  | 'slideRight'
  | 'pop'
  | 'flash'
  | 'pulse'
  | 'shake'
export type LayerAnimationOut = 'none' | 'fadeOut' | 'slideDownOut' | 'slideUpOut' | 'popOut'
export type LayerAnimationEasing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'

/** Per-layer enter/exit animation for video overlays. */
export interface LayerAnimation {
  in?: LayerAnimationIn
  out?: LayerAnimationOut
  /** Progress curve applied to enter/exit ramps. Defaults to linear. */
  easing?: LayerAnimationEasing
  /** Animation duration in milliseconds (applies to both in and out). */
  durationMs?: number
  /**
   * Start offset (ms) within the scene before the enter animation begins.
   * Used for staggered reveals and beat-synced triggers. Defaults to 0.
   */
  delayMs?: number
  /**
   * Loop period (ms) for continuous effects (pulse/flash). Typically set to the
   * music beat interval for tempo-synced motion. When omitted, the effect runs
   * once over `durationMs` instead of looping.
   */
  periodMs?: number
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
  /** Fade the music out over the last N ms of the video (0/undefined = off). */
  fadeOutMs?: number
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
