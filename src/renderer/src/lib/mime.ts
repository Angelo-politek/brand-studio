import type { AssetFolder } from '@shared/types'
import { extOf } from './files'

const EXT_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  gif: 'image/gif',
  bmp: 'image/bmp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  pdf: 'application/pdf'
}

export function mimeFromName(name: string): string {
  return EXT_MIME[extOf(name)] ?? 'application/octet-stream'
}

export function isImageMime(mime: string): boolean {
  return mime.startsWith('image/')
}

export function isVideoMime(mime: string): boolean {
  return mime.startsWith('video/')
}

/** Best-guess asset folder for an imported file based on its mime type. */
export function folderFromMime(mime: string): AssetFolder {
  if (mime.startsWith('image/')) return 'Images'
  if (mime.startsWith('video/')) return 'Videos'
  if (mime.startsWith('audio/')) return 'Audio'
  return 'Documents'
}
