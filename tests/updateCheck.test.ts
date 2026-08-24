import { describe, it, expect } from 'vitest'
import { parseVersion, compareVersions, isNewerVersion } from '@renderer/lib/version'

describe('parseVersion', () => {
  it('parses a plain MAJOR.MINOR.PATCH string', () => {
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3])
  })

  it('parses a v-prefixed string', () => {
    expect(parseVersion('v1.2.3')).toEqual([1, 2, 3])
  })

  it('is case-insensitive on the v prefix', () => {
    expect(parseVersion('V1.2.3')).toEqual([1, 2, 3])
  })

  it('tolerates surrounding whitespace', () => {
    expect(parseVersion('  1.2.3  ')).toEqual([1, 2, 3])
  })

  it('returns null for a malformed string', () => {
    expect(parseVersion('not-a-version')).toBeNull()
  })

  it('returns null for a partial version (missing patch)', () => {
    expect(parseVersion('1.2')).toBeNull()
  })

  it('returns null for a pre-release / build metadata suffix', () => {
    expect(parseVersion('1.2.3-beta.1')).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(parseVersion('')).toBeNull()
  })

  it('returns null for non-string input', () => {
    expect(parseVersion(null as unknown as string)).toBeNull()
    expect(parseVersion(undefined as unknown as string)).toBeNull()
    expect(parseVersion(123 as unknown as string)).toBeNull()
  })
})

describe('compareVersions', () => {
  it('returns 0 for equal versions', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
  })

  it('returns 0 for equal versions with mixed v-prefix', () => {
    expect(compareVersions('v1.2.3', '1.2.3')).toBe(0)
  })

  it('returns 1 when a is greater (patch)', () => {
    expect(compareVersions('1.2.4', '1.2.3')).toBe(1)
  })

  it('returns -1 when a is smaller (patch)', () => {
    expect(compareVersions('1.2.2', '1.2.3')).toBe(-1)
  })

  it('returns 1 when a is greater (minor)', () => {
    expect(compareVersions('1.3.0', '1.2.9')).toBe(1)
  })

  it('returns 1 when a is greater (major)', () => {
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1)
  })

  it('compares numerically, not lexicographically: 1.10.0 > 1.9.0', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1)
    expect(compareVersions('1.9.0', '1.10.0')).toBe(-1)
  })

  it('compares numerically on the patch component too: 1.2.10 > 1.2.9', () => {
    expect(compareVersions('1.2.10', '1.2.9')).toBe(1)
  })

  it('compares numerically on the major component: 10.0.0 > 9.0.0', () => {
    expect(compareVersions('10.0.0', '9.0.0')).toBe(1)
  })

  it('returns 0 when either input is malformed', () => {
    expect(compareVersions('garbage', '1.2.3')).toBe(0)
    expect(compareVersions('1.2.3', 'garbage')).toBe(0)
    expect(compareVersions('garbage', 'also-garbage')).toBe(0)
  })
})

describe('isNewerVersion', () => {
  it('is false when versions are equal', () => {
    expect(isNewerVersion('1.2.3', '1.2.3')).toBe(false)
  })

  it('is true when latest is greater', () => {
    expect(isNewerVersion('1.2.3', '1.2.4')).toBe(true)
  })

  it('is false when latest is smaller (current is newer than the release found)', () => {
    expect(isNewerVersion('1.2.4', '1.2.3')).toBe(false)
  })

  it('handles double-digit components correctly (not lexicographic)', () => {
    expect(isNewerVersion('1.9.0', '1.10.0')).toBe(true)
    expect(isNewerVersion('1.10.0', '1.9.0')).toBe(false)
  })

  it('handles a v-prefixed latest tag against an unprefixed current version', () => {
    expect(isNewerVersion('1.0.0', 'v1.1.0')).toBe(true)
  })

  it('is false when the latest tag is malformed', () => {
    expect(isNewerVersion('1.0.0', 'not-a-version')).toBe(false)
  })

  it('is false when the current version is malformed', () => {
    expect(isNewerVersion('not-a-version', '1.0.0')).toBe(false)
  })
})
