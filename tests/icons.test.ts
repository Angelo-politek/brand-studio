import { describe, it, expect } from 'vitest'
import { colorizeSvg } from '@renderer/lib/icons'

describe('colorizeSvg', () => {
  it('replaces currentColor with the target color', () => {
    const svg = '<svg stroke="currentColor"><path fill="currentColor"/></svg>'
    const out = colorizeSvg(svg, '#ff0000')
    expect(out).toContain('stroke="#ff0000"')
    expect(out).toContain('fill="#ff0000"')
    expect(out).not.toContain('currentColor')
  })

  it('leaves markup without currentColor unchanged', () => {
    const svg = '<svg><rect fill="#123456"/></svg>'
    expect(colorizeSvg(svg, '#000000')).toBe(svg)
  })
})
