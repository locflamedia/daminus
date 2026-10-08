import { describe, expect, it } from 'vitest'
import { daysUntil, slopePerDay } from './forecast'

const DAY = 86_400_000
const line = (values: number[], gap = DAY) =>
  values.map((value, i) => ({ at: Date.UTC(2026, 8, 1) + i * gap, value }))

describe('slopePerDay', () => {
  it('reads the rise per day from the clock, not from the scan number', () => {
    expect(slopePerDay(line([70, 72, 74]))).toBeCloseTo(2)
    expect(slopePerDay(line([70, 72, 74], 2 * DAY))).toBeCloseTo(1)
  })

  it('needs two points that differ in time', () => {
    expect(slopePerDay(line([70]))).toBeNull()
    expect(
      slopePerDay([
        { at: 1, value: 1 },
        { at: 1, value: 2 },
      ]),
    ).toBeNull()
  })

  it('fits only the newest points', () => {
    expect(slopePerDay(line([0, 0, 0, 0, 10, 20, 30, 40, 50, 60]))).toBeCloseTo(10)
  })
})

describe('daysUntil', () => {
  it('counts whole days to the limit, rounding up', () => {
    expect(daysUntil(line([80, 82, 84]), 90)).toBe(3)
    expect(daysUntil(line([80, 81, 82]), 90)).toBe(8)
  })

  it('is 0 at or past the limit and null when the value does not rise', () => {
    expect(daysUntil(line([88, 91]), 90)).toBe(0)
    expect(daysUntil(line([80, 80, 79]), 90)).toBeNull()
    expect(daysUntil([], 90)).toBeNull()
  })
})
