import { describe, it, expect, vi } from 'vitest'

// registerMediaScheme() only calls protocol.registerSchemesAsPrivileged with a
// static privileges object — no Electron runtime needed, so we can assert on
// the exact object passed rather than spinning up a browser window.
const registerSchemesAsPrivileged = vi.fn()
vi.mock('electron', () => ({
  protocol: { registerSchemesAsPrivileged, handle: vi.fn() },
  net: { fetch: vi.fn() }
}))

const { registerMediaScheme, MEDIA_SCHEME } = await import('@main/storage/protocol')

describe('registerMediaScheme', () => {
  it('registers the media scheme with corsEnabled, so <img crossOrigin> loads succeed', () => {
    registerMediaScheme()

    expect(registerSchemesAsPrivileged).toHaveBeenCalledTimes(1)
    const [entry] = registerSchemesAsPrivileged.mock.calls[0][0]
    expect(entry.scheme).toBe(MEDIA_SCHEME)
    // Regression guard: without corsEnabled, Chromium rejects any CORS-mode
    // fetch (as triggered by useImage.ts's `img.crossOrigin = 'anonymous'`,
    // needed to keep canvas exports untainted) to this custom scheme with
    // "Cross origin requests are only supported for protocol schemes:
    // chrome, chrome-extension, ... http, https" — before the request ever
    // reaches handleMediaProtocol. That made every canvas image render as a
    // gray fallback box while the (non-CORS) asset-grid thumbnail still
    // worked fine.
    expect(entry.privileges.corsEnabled).toBe(true)
    // Keep the other required privileges intact.
    expect(entry.privileges.standard).toBe(true)
    expect(entry.privileges.secure).toBe(true)
    expect(entry.privileges.supportFetchAPI).toBe(true)
    expect(entry.privileges.stream).toBe(true)
  })
})
