import { describe, it, expect } from 'vitest'
import { colorizeSvg } from '@renderer/lib/icons'

describe('colorizeSvg', () => {
  it('recolors Lucide currentColor', () => {
    const svg = '<svg stroke="currentColor"><path fill="currentColor"/></svg>'
    const out = colorizeSvg(svg, '#ff0000', 'lucide')
    expect(out).toContain('stroke="#ff0000"')
    expect(out).toContain('fill="#ff0000"')
    expect(out).not.toContain('currentColor')
  })

  it('forces a fill on Simple Icons brand logos', () => {
    const svg = '<svg role="img" viewBox="0 0 24 24"><path d="M0 0"/></svg>'
    const out = colorizeSvg(svg, '#1ED760', 'simple')
    expect(out).toContain('fill="#1ED760"')
  })

  it('null color keeps the original markup (brand logos untouched)', () => {
    const svg = '<svg role="img"><path d="M0 0"/></svg>'
    expect(colorizeSvg(svg, null, 'simple')).toBe(svg)
    expect(colorizeSvg(svg, null, 'lucide')).toBe(svg)
  })
})
