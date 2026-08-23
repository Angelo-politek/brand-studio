import { describe, it, expect, vi } from 'vitest'
import { join } from 'path'

// paths.ts pulls the data root from electron's app.getPath('userData').
const FAKE_USERDATA = join(process.cwd(), '.test-userdata')
vi.mock('electron', () => ({
  app: { getPath: () => FAKE_USERDATA }
}))

const { isUnderDataRoot, toAbsolute, getPaths } = await import('@main/storage/paths')

describe('isUnderDataRoot', () => {
  it('accepts a path inside the data root', () => {
    expect(isUnderDataRoot(toAbsolute('assets/a.png'))).toBe(true)
  })

  it('rejects a traversal outside the data root', () => {
    expect(isUnderDataRoot(toAbsolute('../../secret.txt'))).toBe(false)
  })

  it('rejects a sibling directory with a shared prefix (data-evil)', () => {
    const root = toAbsolute('') // the data root itself
    expect(isUnderDataRoot(root + '-evil')).toBe(false)
  })

  it('accepts the data root itself', () => {
    expect(isUnderDataRoot(toAbsolute(''))).toBe(true)
  })
})

describe('getPaths — logs directory', () => {
  it('exposes a logs path outside the data root, mirroring logger.ts', () => {
    const p = getPaths()
    // logger.ts writes to userData/logs directly (join(app.getPath('userData'), 'logs')),
    // not userData/data/logs — the two must stay in sync.
    expect(p.logs).toBe(join(FAKE_USERDATA, 'logs'))
    expect(isUnderDataRoot(p.logs)).toBe(false)
  })
})
