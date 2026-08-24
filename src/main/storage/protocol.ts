import { protocol, net } from 'electron'
import { pathToFileURL } from 'url'
import { toAbsolute, isUnderDataRoot } from './paths'

export const MEDIA_SCHEME = 'media'

/** Must be called at module load, before app `ready`. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        // Chromium only performs a CORS-mode fetch (as triggered by
        // `img.crossOrigin = 'anonymous'`, used by useImage.ts so canvas
        // exports aren't tainted) against schemes it trusts for CORS. A
        // custom scheme without this flag is rejected outright with
        // "Cross origin requests are only supported for protocol schemes:
        // chrome, chrome-extension, ... http, https" — before the request
        // even reaches handleMediaProtocol's Access-Control-Allow-Origin
        // header below. Without it, any <img crossOrigin> load of a
        // media:// URL fails and the canvas falls back to a gray box.
        corsEnabled: true
      }
    }
  ])
}

/**
 * Serve files from the data root over `media://local/<relative-path>`.
 * Streamed from disk so thousands of assets stay cheap; path traversal is blocked.
 */
export function handleMediaProtocol(): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '')
      const abs = toAbsolute(rel)
      if (!isUnderDataRoot(abs)) {
        return new Response('Forbidden', { status: 403 })
      }
      const res = await net.fetch(pathToFileURL(abs).toString())
      // Add CORS so images drawn to a canvas stay untainted (needed for export).
      const headers = new Headers(res.headers)
      headers.set('Access-Control-Allow-Origin', '*')
      return new Response(res.body, { status: res.status, headers })
    } catch {
      return new Response('Bad Request', { status: 400 })
    }
  })
}
