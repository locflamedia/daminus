import { describe, expect, it } from 'vitest'
import { barWidth, bandOf } from './chart-bands'

describe('bandOf', () => {
  const disk = { warn: 80, crit: 90 }

  it('is ok below warn, warn from it, crit from the crit line', () => {
    expect(bandOf(79.9, disk)).toBe('ok')
    expect(bandOf(80, disk)).toBe('warn')
    expect(bandOf(89, disk)).toBe('warn')
    expect(bandOf(90, disk)).toBe('crit')
  })

  it('reads days left the other way round', () => {
    const ssl = { warn: 14, crit: 3, lowIsBad: true }
    expect(bandOf(41, ssl)).toBe('ok')
    expect(bandOf(14, ssl)).toBe('warn')
    expect(bandOf(3, ssl)).toBe('crit')
  })

  it('is off for a missing reading, never ok', () => {
    expect(bandOf(null, disk)).toBe('off')
    expect(bandOf(undefined, disk)).toBe('off')
    expect(bandOf(Number.NaN, disk)).toBe('off')
  })
})

describe('barWidth', () => {
  it('holds a bar to 0..100 and draws nothing for a missing value', () => {
    expect(barWidth(104)).toBe(100)
    expect(barWidth(-3)).toBe(0)
    expect(barWidth(null)).toBe(0)
    expect(barWidth(42)).toBe(42)
  })
})
