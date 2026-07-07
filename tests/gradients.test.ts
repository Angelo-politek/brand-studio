import { describe, it, expect } from 'vitest'
import { gradientToKonvaProps, offsetGradient } from '@renderer/lib/gradients'

describe('gradientToKonvaProps', () => {
  it('returns null without a gradient', () => {
    expect(gradientToKonvaProps(null, 100, 100)).toBeNull()
    expect(gradientToKonvaProps(undefined, 100, 100)).toBeNull()
  })

  it('linear 0° spans left→right across the box', () => {
    const p = gradientToKonvaProps({ type: 'linear', from: '#fff', to: '#000', angle: 0 }, 100, 40)!
    expect(p.fillPriority).toBe('linear-gradient')
    expect(p.fillLinearGradientStartPoint!.x).toBeCloseTo(0, 5)
    expect(p.fillLinearGradientEndPoint!.x).toBeCloseTo(100, 5)
    expect(p.fillLinearGradientStartPoint!.y).toBeCloseTo(20, 5)
    expect(p.fillLinearGradientColorStops).toEqual([0, '#fff', 1, '#000'])
  })

  it('linear 90° spans top→bottom', () => {
    const p = gradientToKonvaProps(
      { type: 'linear', from: '#fff', to: '#000', angle: 90 },
      100,
      40
    )!
    expect(p.fillLinearGradientStartPoint!.y).toBeCloseTo(0, 5)
    expect(p.fillLinearGradientEndPoint!.y).toBeCloseTo(40, 5)
  })

  it('radial is centered with radius = half the larger side', () => {
    const p = gradientToKonvaProps({ type: 'radial', from: '#fff', to: '#000' }, 100, 60)!
    expect(p.fillPriority).toBe('radial-gradient')
    expect(p.fillRadialGradientEndPoint).toEqual({ x: 50, y: 30 })
    expect(p.fillRadialGradientEndRadius).toBe(50)
  })

  it('offsetGradient shifts all points', () => {
    const p = gradientToKonvaProps({ type: 'linear', from: '#fff', to: '#000', angle: 0 }, 100, 40)!
    const o = offsetGradient(p, -50, -20)
    expect(o.fillLinearGradientStartPoint).toEqual({ x: -50, y: 0 })
    expect(o.fillLinearGradientEndPoint).toEqual({ x: 50, y: 0 })
  })
})
