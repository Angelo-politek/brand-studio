import type { OpenFileDialogOptions } from '@shared/ipc'

export async function pickFiles(
  filters?: OpenFileDialogOptions['filters'],
  multi = false
): Promise<string[]> {
  return window.api.app.openFileDialog({ filters, multi })
}

export async function readFileBytes(absPath: string): Promise<Uint8Array> {
  return window.api.app.readFile(absPath)
}

/** Persist bytes under <subdir> in the data root, returning the relative path. */
export async function saveBinary(
  subdir: string,
  filename: string,
  bytes: Uint8Array
): Promise<string> {
  return window.api.app.saveBinary({ subdir, filename, bytes })
}

export function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}

export function extOf(name: string): string {
  const m = name.match(/\.([a-zA-Z0-9]+)$/)
  return m ? m[1].toLowerCase() : ''
}

/** Read a browser File/Blob as a Uint8Array. */
export async function fileToBytes(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer())
}

export const IMAGE_FILTERS: OpenFileDialogOptions['filters'] = [
  { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif', 'bmp'] }
]

export const FONT_FILTERS: OpenFileDialogOptions['filters'] = [
  { name: 'Fonts', extensions: ['ttf', 'otf', 'woff', 'woff2'] }
]
