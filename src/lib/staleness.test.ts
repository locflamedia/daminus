import { describe, expect, it } from 'vitest'
import { staleDays } from './staleness'

const NOW = Date.parse('2026-09-26T12:00:00Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const HOUR = 3_600_000

describe('staleDays', () => {
  it('is null for a scan under a day old, and when there is none', () => {
    expect(staleDays(ago(23 * HOUR), NOW)).toBeNull()
    expect(staleDays(null, NOW)).toBeNull()
    expect(staleDays(undefined, NOW)).toBeNull()
    expect(staleDays('not a date', NOW)).toBeNull()
  })

  it('counts whole days from a day on', () => {
    expect(staleDays(ago(24 * HOUR), NOW)).toBe(1)
    expect(staleDays(ago(47 * HOUR), NOW)).toBe(1)
    expect(staleDays(ago(4 * 24 * HOUR + HOUR), NOW)).toBe(4)
  })
})
