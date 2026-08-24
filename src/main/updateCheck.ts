import { net } from 'electron'

const RELEASES_API_URL = 'https://api.github.com/repos/Angelo-politek/brand-studio/releases/latest'
/** GitHub requires a User-Agent on API requests or it answers 403. */
const USER_AGENT = 'brand-studio-update-check'
const REQUEST_TIMEOUT_MS = 10_000

/**
 * Manual, opt-in "check for updates" — never called automatically. Brand
 * Studio is offline-first (see README: "no data leaving your device"), so the
 * only network request this app ever makes to the outside world is this one,
 * and only when the user explicitly clicks the button in Settings.
 *
 * Runs in the main process (not the renderer) so it never needs to widen the
 * renderer's restrictive connect-src CSP — see src/main/index.ts (applyCsp)
 * and src/renderer/index.html.
 */
export interface UpdateCheckResult {
  ok: boolean
  /** Release tag as published on GitHub, e.g. "v1.2.0". Present only if ok. */
  latestTag?: string
  /** HTML page for the release, to open in the browser. Present only if ok. */
  htmlUrl?: string
  /** User-facing message, set when ok is false (offline, rate-limited, malformed, …). */
  error?: string
}

function withTimeout(ms: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return { signal: controller.signal, cancel: () => clearTimeout(timer) }
}

/**
 * Fetches the latest published release from GitHub's public API. Never
 * throws — every failure mode (offline, DNS, GitHub rate limiting, a
 * malformed/unexpected response body) is reported back as `{ ok: false,
 * error }` so the renderer can show a plain message instead of crashing.
 */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const { signal, cancel } = withTimeout(REQUEST_TIMEOUT_MS)
  try {
    const res = await net.fetch(RELEASES_API_URL, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': USER_AGENT
      },
      signal
    })

    if (res.status === 403 || res.status === 429) {
      return { ok: false, error: 'GitHub rate limit reached — try again in a while.' }
    }
    if (res.status === 404) {
      return { ok: false, error: 'No published releases found on GitHub yet.' }
    }
    if (!res.ok) {
      return { ok: false, error: `GitHub returned an unexpected response (HTTP ${res.status}).` }
    }

    let body: unknown
    try {
      body = await res.json()
    } catch {
      return { ok: false, error: 'GitHub returned a response Brand Studio could not understand.' }
    }

    if (
      typeof body !== 'object' ||
      body === null ||
      !('tag_name' in body) ||
      typeof (body as { tag_name: unknown }).tag_name !== 'string'
    ) {
      return { ok: false, error: 'GitHub returned a response Brand Studio could not understand.' }
    }

    const tag = (body as { tag_name: string }).tag_name
    const htmlUrl =
      'html_url' in body && typeof (body as { html_url: unknown }).html_url === 'string'
        ? (body as { html_url: string }).html_url
        : `https://github.com/Angelo-politek/brand-studio/releases/tag/${tag}`

    return { ok: true, latestTag: tag, htmlUrl }
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError'
    return {
      ok: false,
      error: aborted
        ? 'The request to GitHub timed out — check your internet connection.'
        : 'Could not reach GitHub — check your internet connection.'
    }
  } finally {
    cancel()
  }
}
