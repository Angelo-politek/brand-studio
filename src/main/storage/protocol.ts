import { protocol, net } from 'electron'
import { pathToFileURL } from 'url'
import { toAbsolute, isUnderDataRoot } from './paths'

export const MEDIA_SCHEME = 'media'

/** Must be called at module load, before app `ready`. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
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
