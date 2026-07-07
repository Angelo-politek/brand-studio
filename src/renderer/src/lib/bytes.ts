/**
 * Decode a data: URL into raw bytes without touching the network stack.
 * (A `fetch(dataUrl)` would be blocked by the CSP's connect-src.)
 */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] ?? ''
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}
