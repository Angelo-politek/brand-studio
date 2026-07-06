export type PresetCategory = 'Social' | 'Print' | 'Marketing' | 'Video' | 'Hardware'

/** Whether a preset is for a static design or a video project. */
export type PresetKind = 'design' | 'video'

export interface SizePreset {
  type: string
  label: string
  category: PresetCategory
  width: number
  height: number
  /** Defaults to 'design' when omitted. */
  kind?: PresetKind
}

// Print sizes are px @ 300 DPI.
export const SIZE_PRESETS: SizePreset[] = [
  // Social
  {
    type: 'instagram_post',
    label: 'Instagram Post (Square)',
    category: 'Social',
    width: 1080,
    height: 1080
  },
  {
    type: 'instagram_post_portrait',
    label: 'Instagram Post (Portrait)',
    category: 'Social',
    width: 1080,
    height: 1350
  },
  {
    type: 'instagram_story',
    label: 'Instagram Story',
    category: 'Social',
    width: 1080,
    height: 1920
  },
  { type: 'reel_cover', label: 'Reel Cover', category: 'Social', width: 1080, height: 1920 },
  { type: 'facebook_cover', label: 'Facebook Cover', category: 'Social', width: 1640, height: 924 },
  { type: 'linkedin_post', label: 'LinkedIn Post', category: 'Social', width: 1200, height: 1200 },
  // Print
  { type: 'a5', label: 'A5', category: 'Print', width: 1748, height: 2480 },
  { type: 'a4', label: 'A4', category: 'Print', width: 2480, height: 3508 },
  { type: 'a3', label: 'A3', category: 'Print', width: 3508, height: 4961 },
  { type: 'flyer', label: 'Flyer (A5)', category: 'Print', width: 1748, height: 2480 },
  { type: 'poster', label: 'Poster (A2)', category: 'Print', width: 4961, height: 7016 },
  // Marketing
  { type: 'banner', label: 'Banner', category: 'Marketing', width: 1500, height: 500 },
  { type: 'web_header', label: 'Web Header', category: 'Marketing', width: 1920, height: 600 },
  {
    type: 'product_sheet',
    label: 'Product Sheet',
    category: 'Marketing',
    width: 2480,
    height: 3508
  },
  // Hardware front panels (visual mockups, 10 px per mm)
  {
    type: 'eurorack_8hp',
    label: 'Eurorack 8HP (3U)',
    category: 'Hardware',
    width: 406, // 8 × 5.08mm
    height: 1285 // 128.5mm
  },
  {
    type: 'eurorack_12hp',
    label: 'Eurorack 12HP (3U)',
    category: 'Hardware',
    width: 610,
    height: 1285
  },
  {
    type: 'eurorack_16hp',
    label: 'Eurorack 16HP (3U)',
    category: 'Hardware',
    width: 813,
    height: 1285
  },
  {
    type: 'rack_1u',
    label: '19″ Rack 1U',
    category: 'Hardware',
    width: 4826, // 482.6mm
    height: 444 // 44.45mm
  },
  {
    type: 'rack_2u',
    label: '19″ Rack 2U',
    category: 'Hardware',
    width: 4826,
    height: 889
  },
  {
    type: 'desktop_unit',
    label: 'Desktop unit (30×20cm)',
    category: 'Hardware',
    width: 3000,
    height: 2000
  },
  // Video
  {
    type: 'reel',
    label: 'Reel / Story',
    category: 'Video',
    width: 1080,
    height: 1920,
    kind: 'video'
  },
  {
    type: 'video_post_square',
    label: 'Video Post (Square)',
    category: 'Video',
    width: 1080,
    height: 1080,
    kind: 'video'
  },
  {
    type: 'video_post_portrait',
    label: 'Video Post (Portrait)',
    category: 'Video',
    width: 1080,
    height: 1350,
    kind: 'video'
  }
]

export const PRESET_CATEGORIES: PresetCategory[] = ['Social', 'Print', 'Marketing', 'Hardware']

/** Categories shown when creating a video project. */
export const VIDEO_PRESET_CATEGORIES: PresetCategory[] = ['Video']

export function presetByType(type: string): SizePreset | undefined {
  return SIZE_PRESETS.find((p) => p.type === type)
}

/** Presets for static designs (everything that isn't a video preset). */
export const DESIGN_PRESETS: SizePreset[] = SIZE_PRESETS.filter((p) => p.kind !== 'video')

/** Presets for video projects. */
export const VIDEO_PRESETS: SizePreset[] = SIZE_PRESETS.filter((p) => p.kind === 'video')
