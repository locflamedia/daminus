import { describe, expect, it } from 'vitest'
import { buildDiskChart } from '@/lib/server-disk'
import { buildKpis } from '@/lib/server-metrics'
import { factSeries, item } from '@/testing/item-fixture'
import { diskTips, findingEvidence, kpiView } from './server-text'

const host = 'a'
const kpis = (pct: number, before: number) =>
  buildKpis(
    [
      item({
        host,
        check: 'disk.fs',
        target: '/',
        level: { level: 'warn' },
        data: { pct, used: 90e9 },
      }),
    ],
    [item({ host, check: 'disk.fs', target: '/', data: { pct: before, used: 87e9 } })],
    [],
    host,
  )[2]

describe('kpiView', () => {
  it('writes the disk change in points with the bytes beside it', () => {
    const view = kpiView(kpis(87, 84)!, 'en')
    expect(view).toMatchObject({ value: '87', small: '%', glyph: '▲', tone: 'warn' })
    expect(view.change).toMatch(/^3 pts · \+2\.79 GB$/)
  })

  it('has no change line without a baseline, and says so for an unchanged value', () => {
    expect(kpiView(buildKpis([], [], [], host)[0]!, 'en')).toMatchObject({
      value: null,
      change: '',
    })
    expect(kpiView(kpis(87, 87)!, 'en').change).toBe('no change')
  })

  it('puts the unit of load as cores and reads in Vietnamese', () => {
    const load = buildKpis(
      [item({ host, check: 'sys.load', value: 1.62, data: { cores: 4 } })],
      [],
      [],
      host,
    )[0]!
    expect(kpiView(load, 'en')).toMatchObject({
      value: '1.62',
      small: '/ 4 cores',
      detail: 'CPU ≈ 41% busy',
    })
    expect(kpiView(load, 'vi').label).toBe('Tải')
  })

  it('shows the age instead of a change when the result is old', () => {
    const stale = buildKpis(
      [item({ host, check: 'sys.swap', value: 3, disposition: { kind: 'stale', since_seq: 7 } })],
      [item({ host, check: 'sys.swap', value: 2 })],
      [],
      host,
    )[3]!
    expect(kpiView(stale, 'en')).toMatchObject({
      detail: 'Not re-checked since #7',
      change: '',
      glyph: '',
      spark: { tone: 'stale' },
    })
  })
})

describe('diskTips', () => {
  const facts = factSeries(host, 'disk.fs', [80, 82, 84, 86], { target: '/', field: 'pct' })
  const chart = buildDiskChart(
    item({ host, check: 'disk.fs', target: '/', data: { pct: 86 } }),
    facts,
    host,
  )!

  it('gives every scan a card with the change since the one before', () => {
    const tips = diskTips(chart, 'en')
    expect(tips).toHaveLength(4)
    expect(tips[0]?.delta).toBeUndefined()
    expect(tips[1]).toMatchObject({ value: '82%', delta: '+2 pts' })
  })

  it('puts the forecast on the newest scan only', () => {
    const tips = diskTips(chart, 'en')
    expect(tips[3]?.note).toMatch(/^90% in about \d+ days? at this pace$/)
    expect(tips[2]?.note).toBeUndefined()
    expect(tips[3]?.spoken).toContain('scan #4')
  })

  it('says the disk is at the limit once it is', () => {
    const full = factSeries(host, 'disk.fs', [88, 91], { target: '/', field: 'pct' })
    const c = buildDiskChart(
      item({ host, check: 'disk.fs', target: '/', data: { pct: 91 } }),
      full,
      host,
    )!
    expect(diskTips(c, 'en')[1]?.note).toBe('At or over 90% now')
  })
})

describe('findingEvidence', () => {
  it('names how long an issue has stood, or why it has no answer', () => {
    const still = item({
      check: 'disk.fs',
      value: 87,
      unit: '%',
      delta: { kind: 'still', scans_open: 3 },
    })
    expect(findingEvidence(still, 'en')).toBe('87% · Open for 3 scans')
    const blind = item({ check: 'sys.load', level: { level: 'unknown', reason: 'needs_perm' } })
    expect(findingEvidence(blind, 'en')).toBe('Needs permission')
  })
})
