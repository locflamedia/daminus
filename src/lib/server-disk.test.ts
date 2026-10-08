import { describe, expect, it } from 'vitest'
import { factSeries, item, T0 } from '@/testing/item-fixture'
import { FORECAST_HORIZON_DAYS } from './presentation-hints'
import { axisTicks, buildDiskChart, diskDomain, diskThresholds } from './server-disk'

const DAY = 86_400_000
const host = 'vps-a'
const fs = item({
  host,
  check: 'disk.fs',
  target: '/',
  data: { pct: 87, size: 95e9, used: 82.6e9, avail: 12.4e9 },
})

describe('diskThresholds', () => {
  it('reads the warn and crit lines the core grades disk space with', () => {
    expect(diskThresholds()).toEqual({ warn: 80, crit: 90 })
  })
})

describe('buildDiskChart', () => {
  const facts = factSeries(host, 'disk.fs', [71, 72, 74, 75, 77, 79, 81, 84, 87], {
    target: '/',
    field: 'pct',
  })

  it('places each scan at the moment it ran and reads the forecast in days', () => {
    const chart = buildDiskChart(fs, facts, host)
    expect(chart?.points.map((p) => p.at)).toEqual(facts.map((f) => Date.parse(f.at)))
    expect(chart?.forecastDays).toBeGreaterThan(0)
    expect(chart?.forecastDays).toBeLessThan(5)
    expect(chart?.sizes).toEqual({ size: 95e9, used: 82.6e9, avail: 12.4e9 })
  })

  it('needs two scans of the filesystem before it draws', () => {
    expect(buildDiskChart(fs, facts.slice(0, 1), host)).toBeNull()
    expect(buildDiskChart(undefined, facts, host)).toBeNull()
  })

  it('leaves out a forecast when the disk is not filling or the date is far away', () => {
    const flat = factSeries(host, 'disk.fs', [60, 60, 59], { target: '/', field: 'pct' })
    expect(buildDiskChart(fs, flat, host)?.forecastDays).toBeNull()
    const slow = factSeries(host, 'disk.fs', [10, 10.1, 10.2], {
      target: '/',
      field: 'pct',
      gap: DAY,
    })
    expect(FORECAST_HORIZON_DAYS).toBeLessThan(900)
    expect(buildDiskChart(fs, slow, host)?.forecastDays).toBeNull()
  })

  it('keeps only the last ten scans', () => {
    const many = factSeries(
      host,
      'disk.fs',
      Array.from({ length: 14 }, (_, i) => 50 + i),
      {
        target: '/',
        field: 'pct',
      },
    )
    expect(buildDiskChart(fs, many, host)?.points).toHaveLength(10)
  })
})

describe('diskDomain', () => {
  it('runs from a round value under the lowest reading to 100 and puts gridlines below warn', () => {
    const points = [71, 87].map((value, seq) => ({ seq, at: T0 + seq * DAY, value }))
    expect(diskDomain(points, 80)).toEqual({ domain: [60, 100], grid: [60, 70] })
  })
})

describe('axisTicks', () => {
  const points = [0, 1, 3, 5, 5.4, 6, 8, 9, 10].map((d, seq) => ({
    seq,
    at: T0 + d * DAY,
    value: 70 + seq,
  }))

  it('labels the first day, days between and the last, which says today when it is', () => {
    const ticks = axisTicks(points, points[8]?.at ?? 0, 'en', 'today')
    expect(ticks[0]).toMatchObject({ index: 0, text: '15 Sep', anchor: 'start' })
    expect(ticks.at(-1)).toMatchObject({ text: '25 Sep · today', anchor: 'end' })
    expect(ticks.slice(1, -1).every((t) => /^\d+$/.test(t.text))).toBe(true)
  })

  it('has no interior labels for a short span and does not say today for an old scan', () => {
    const short = points.slice(0, 3)
    const ticks = axisTicks(short, T0 + 30 * DAY, 'en', 'today')
    expect(ticks.map((t) => t.text)).toEqual(['15 Sep', '18 Sep'])
  })
})
