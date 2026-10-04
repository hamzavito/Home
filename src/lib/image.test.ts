import { describe, expect, it } from 'vitest'
import { IMAGE_LIMITS, targetSize } from './image'

describe('targetSize', () => {
  it('almindeligt iPhone-foto (4032×3024 liggende) skaleres til maks bredde', () => {
    expect(targetSize(4032, 3024)).toEqual({ width: 1600, height: 1200 })
  })
  it('stående kvitteringsfoto (3024×4032) bevarer læsbar bredde', () => {
    const t = targetSize(3024, 4032)
    expect(t.width).toBe(1600)
    expect(t.height).toBe(2133)
  })
  it('lang kvittering bevarer højde og læsbar bredde', () => {
    const t = targetSize(1200, 6000)
    expect(t.height).toBeLessThanOrEqual(IMAGE_LIMITS.maxHeight)
    expect(t.width).toBeGreaterThanOrEqual(IMAGE_LIMITS.minWidth)
    expect(t.width * t.height).toBeLessThanOrEqual(IMAGE_LIMITS.maxPixels)
  })
  it('skalerer aldrig op', () => {
    expect(targetSize(800, 1000)).toEqual({ width: 800, height: 1000 })
  })
  it('respekterer pixelgrænsen', () => {
    const t = targetSize(3000, 9000)
    expect(t.width * t.height).toBeLessThanOrEqual(IMAGE_LIMITS.maxPixels)
  })
  it('ugyldige mål', () => {
    expect(targetSize(0, 100)).toEqual({ width: 0, height: 0 })
  })
})
