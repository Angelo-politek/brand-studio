import { describe, it, expect } from 'vitest'
import { isPythonReady, canRestartPython } from '@renderer/components/BackendStatus'
import type { PythonStatusValue } from '@shared/ipc'

const ALL_STATUSES: PythonStatusValue[] = [
  'idle',
  'setting-up',
  'starting',
  'ready',
  'down',
  'unavailable'
]

describe('isPythonReady', () => {
  it('is true only for "ready"', () => {
    for (const status of ALL_STATUSES) {
      expect(isPythonReady(status)).toBe(status === 'ready')
    }
  })
})

describe('canRestartPython', () => {
  it('is true for "down" and "unavailable"', () => {
    expect(canRestartPython('down')).toBe(true)
    expect(canRestartPython('unavailable')).toBe(true)
  })

  it('is false while starting up or already ready', () => {
    expect(canRestartPython('idle')).toBe(false)
    expect(canRestartPython('setting-up')).toBe(false)
    expect(canRestartPython('starting')).toBe(false)
    expect(canRestartPython('ready')).toBe(false)
  })
})
