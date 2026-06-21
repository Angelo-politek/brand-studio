import { describe, it, expect } from 'vitest'
import * as S from '@shared/schemas'

describe('IPC schemas — saveBinaryInput', () => {
  it('accepts a whitelisted subdir', () => {
    const r = S.saveBinaryInput.safeParse({
      subdir: 'assets',
      filename: 'logo.png',
      bytes: new Uint8Array([1, 2, 3])
    })
    expect(r.success).toBe(true)
  })

  it('rejects a non-whitelisted subdir (path escape attempt)', () => {
    const r = S.saveBinaryInput.safeParse({
      subdir: '../../etc',
      filename: 'passwd',
      bytes: new Uint8Array([1])
    })
    expect(r.success).toBe(false)
  })

  it('rejects an oversized binary payload', () => {
    const r = S.saveBinaryInput.safeParse({
      subdir: 'assets',
      filename: 'big.bin',
      // Length is checked against MAX_BINARY_BYTES via byteLength; fake it.
      bytes: { byteLength: S.MAX_BINARY_BYTES + 1 } as unknown as Uint8Array
    })
    expect(r.success).toBe(false)
  })

  it('rejects a missing filename', () => {
    const r = S.saveBinaryInput.safeParse({
      subdir: 'assets',
      filename: '',
      bytes: new Uint8Array([1])
    })
    expect(r.success).toBe(false)
  })
})

describe('IPC schemas — projectCreateInput', () => {
  it('accepts a valid project', () => {
    const r = S.projectCreateInput.safeParse({
      brandId: 'b1',
      name: 'My project',
      type: 'instagram_post',
      canvas: { width: 1080, height: 1080, background: '#fff' }
    })
    expect(r.success).toBe(true)
  })

  it('rejects non-positive canvas dimensions', () => {
    const r = S.projectCreateInput.safeParse({
      brandId: 'b1',
      name: 'x',
      type: 't',
      canvas: { width: 0, height: -5, background: '#fff' }
    })
    expect(r.success).toBe(false)
  })

  it('rejects an empty brandId', () => {
    const r = S.projectCreateInput.safeParse({
      brandId: '',
      name: 'x',
      type: 't',
      canvas: { width: 100, height: 100, background: '#fff' }
    })
    expect(r.success).toBe(false)
  })
})

describe('IPC schemas — videoCreateInput', () => {
  it('caps absurd dimensions', () => {
    const r = S.videoCreateInput.safeParse({
      brandId: 'b1',
      name: 'reel',
      width: 1_000_000,
      height: 1080
    })
    expect(r.success).toBe(false)
  })
})
