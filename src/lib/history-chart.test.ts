import { describe, expect, it } from 'vitest'
import { CHART_INSET, CHART_W, drawSeries, nearestScan, timeAxis, xOf } from './history-chart'

const scans = [
  { seq: 1, at: 0 },
  { seq: 2, at: 100 },
  { seq: 3, at: 1000 },
]

describe('history chart geometry', () => {
  it('puts scans at their time, not their rank', () => {
    const axis = timeAxis(scans)
    expect(xOf(axis, 0)).toBe(CHART_INSET.x)
    expect(xOf(axis, 1000)).toBe(CHART_W - CHART_INSET.x)
    expect(xOf(axis, 100)).toBeLessThan((CHART_W - CHART_INSET.x) / 4)
  })

  it('centres a single scan', () => {
    const axis = timeAxis([{ seq: 1, at: 5 }])
    expect(xOf(axis, 5)).toBe(CHART_W / 2)
  })

  it('draws a curve with a point per scan and nothing for no data', () => {
    const axis = timeAxis(scans)
    const drawn = drawSeries(
      scans.map((s, i) => ({ ...s, value: [1, 5, 2][i] as number })),
      axis,
    )
    expect(drawn?.points.size).toBe(3)
    expect(drawn?.line.startsWith('M')).toBe(true)
    expect(drawSeries([], axis)).toBeNull()
  })

  it('finds the scan nearest to a pointer', () => {
    const axis = timeAxis(scans)
    expect(nearestScan(axis, 0.01)).toBe(1)
    expect(nearestScan(axis, 0.12)).toBe(2)
    expect(nearestScan(axis, 0.9)).toBe(3)
    expect(nearestScan(timeAxis([]), 0.5)).toBeNull()
  })
})
