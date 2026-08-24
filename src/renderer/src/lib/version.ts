/**
 * Pure semver-ish comparison for the manual "Check for updates" feature
 * (Settings page). No network, no electron — just string parsing, so it is
 * cheap to unit test exhaustively.
 *
 * Deliberately simple: Brand Studio only ever compares `package.json`'s
 * version against a GitHub release tag, both of which are plain `MAJOR.MINOR.PATCH`
 * (optionally `v`-prefixed). Full semver (pre-release/build metadata) is out
 * of scope — this project doesn't publish those.
 */

/** Parses "v1.10.0" / "1.10.0" into [1, 10, 0]. Returns null if malformed. */
export function parseVersion(raw: string): [number, number, number] | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim().replace(/^v/i, '')
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(trimmed)
  if (!match) return null
  const [, major, minor, patch] = match
  return [Number(major), Number(minor), Number(patch)]
}

/**
 * Compares two version strings numerically component-by-component (never
 * lexicographically — "1.10.0" must sort after "1.9.0", not before it).
 * Returns 1 if `a` > `b`, -1 if `a` < `b`, 0 if equal or if either is
 * unparseable (a malformed input is never treated as "newer").
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const va = parseVersion(a)
  const vb = parseVersion(b)
  if (!va || !vb) return 0
  for (let i = 0; i < 3; i++) {
    if (va[i] > vb[i]) return 1
    if (va[i] < vb[i]) return -1
  }
  return 0
}

/** True only if `latest` is both parseable and strictly greater than `current`. */
export function isNewerVersion(current: string, latest: string): boolean {
  if (!parseVersion(current) || !parseVersion(latest)) return false
  return compareVersions(latest, current) === 1
}
