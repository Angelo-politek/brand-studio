import { describe, it, expect, vi } from 'vitest'

// repositories.ts imports the DB connection module (which needs electron); mock
// both so we can unit-test the pure safeJson helper in isolation.
vi.mock('electron', () => ({ app: { getPath: () => process.cwd() } }))
vi.mock('@main/db/connection', () => ({ getDb: () => ({}) }))

const { safeJson } = await import('@main/db/repositories')

describe('safeJson', () => {
  it('parses valid JSON', () => {
    expect(safeJson('[1,2,3]', [])).toEqual([1, 2, 3])
  })

  it('returns the fallback on corrupt JSON', () => {
    expect(safeJson('{not json', [])).toEqual([])
  })

  it('returns the fallback for non-string input', () => {
    expect(safeJson(null, { a: 1 })).toEqual({ a: 1 })
    expect(safeJson(undefined, [])).toEqual([])
  })
})
