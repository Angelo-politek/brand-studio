import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { rotateIfNeeded } from '@main/logger'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bs-logger-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('rotateIfNeeded', () => {
  it('does nothing when the log file does not exist', () => {
    expect(() => rotateIfNeeded(dir, 'main.log', 10, 2)).not.toThrow()
    expect(existsSync(join(dir, 'main.log'))).toBe(false)
  })

  it('does nothing when the log is under the size threshold', () => {
    writeFileSync(join(dir, 'main.log'), 'small')
    rotateIfNeeded(dir, 'main.log', 1024, 2)
    expect(existsSync(join(dir, 'main.log'))).toBe(true)
    expect(existsSync(join(dir, 'main.log.1'))).toBe(false)
  })

  it('rotates main.log to main.log.1 once past the threshold', () => {
    writeFileSync(join(dir, 'main.log'), 'x'.repeat(20))
    rotateIfNeeded(dir, 'main.log', 10, 2)
    expect(existsSync(join(dir, 'main.log'))).toBe(false)
    expect(readFileSync(join(dir, 'main.log.1'), 'utf8')).toBe('x'.repeat(20))
  })

  it('shifts existing numbered backups up before rotating', () => {
    writeFileSync(join(dir, 'main.log'), 'newest'.padEnd(20, 'x'))
    writeFileSync(join(dir, 'main.log.1'), 'was-1')
    writeFileSync(join(dir, 'main.log.2'), 'was-2')
    rotateIfNeeded(dir, 'main.log', 10, 2)
    expect(readFileSync(join(dir, 'main.log.1'), 'utf8')).toBe('newest'.padEnd(20, 'x'))
    expect(readFileSync(join(dir, 'main.log.2'), 'utf8')).toBe('was-1')
    // was-2 fell off the end (maxFiles = 2).
    expect(existsSync(join(dir, 'main.log.3'))).toBe(false)
  })

  it('drops the oldest backup once at capacity', () => {
    writeFileSync(join(dir, 'main.log'), 'x'.repeat(20))
    writeFileSync(join(dir, 'main.log.1'), 'was-1')
    writeFileSync(join(dir, 'main.log.2'), 'was-2-should-be-deleted')
    rotateIfNeeded(dir, 'main.log', 10, 2)
    expect(readFileSync(join(dir, 'main.log.2'), 'utf8')).toBe('was-1')
  })
})
