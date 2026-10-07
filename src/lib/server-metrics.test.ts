import { describe, expect, it } from 'vitest'
import { factSeries, item } from '@/testing/item-fixture'
import { buildKpis, deltaTone, fullestDisk } from './server-metrics'

const host = 'vps-a'

function items(overrides: { load?: number; mem?: number; swap?: number; pct?: number } = {}) {
  return [
    item({
      host,
      check: 'sys.load',
      value: overrides.load ?? 1.62,
      unit: 'load',
      data: { cores: 4 },
    }),
    item({
      host,
      check: 'sys.mem',
      value: overrides.mem ?? 24,
      unit: '%',
      data: { total: 8_000_000_000, available: 1_920_000_000 },
    }),
    item({ host, check: 'sys.swap', value: overrides.swap ?? 12, unit: '%' }),
    item({
      host,
      check: 'disk.fs',
      target: '/',
      level: { level: 'warn' },
      data: { pct: overrides.pct ?? 87, used: 82_600_000_000 },
    }),
  ]
}

describe('buildKpis', () => {
  it('reads load against the cores, and how busy the cpu is', () => {
    const [load] = buildKpis(items(), [], [], host)
    expect(load).toMatchObject({
      id: 'load',
      value: 1.62,
      of: 4,
      detail: { kind: 'busy', pct: 41 },
    })
  })

  it('gives memory in bytes when the check carries the totals, and the share still free', () => {
    const memory = buildKpis(items(), [], [], host)[1]
    expect(memory).toMatchObject({ unit: 'bytes', of: 8_000_000_000, value: 6_080_000_000 })
    expect(memory?.detail).toEqual({ kind: 'available', pct: 24 })
  })

  it('falls back to the used share when the totals are missing', () => {
    const bare = [item({ host, check: 'sys.mem', value: 24, unit: '%' })]
    expect(buildKpis(bare, [], [], host)[1]).toMatchObject({ unit: '%', value: 76, of: null })
  })

  it('takes the card state from the core severity and the change from the baseline', () => {
    const disk = buildKpis(items({ pct: 87 }), items({ pct: 84 }), [], host)[2]
    expect(disk).toMatchObject({ level: 'warn', mount: '/', value: 87 })
    expect(disk?.delta).toMatchObject({ direction: 'up', amount: 3, unit: 'pts' })
    expect(disk && deltaTone(disk)).toBe('warn')
  })

  it('has no change without a baseline and calls an unchanged value flat', () => {
    expect(buildKpis(items(), [], [], host)[0]?.delta).toBeNull()
    const flat = buildKpis(items(), items(), [], host)[0]
    expect(flat?.delta?.direction).toBe('flat')
    expect(flat && deltaTone(flat)).toBe('plain')
  })

  it('shows a drop in green', () => {
    const swap = buildKpis(items({ swap: 12 }), items({ swap: 13 }), [], host)[3]
    expect(swap?.delta).toMatchObject({ direction: 'down', amount: 1 })
    expect(swap && deltaTone(swap)).toBe('ok')
  })

  it('draws the sparkline from the host facts only, newest ten scans', () => {
    const facts = [
      ...factSeries(host, 'sys.load', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
      ...factSeries('other', 'sys.load', [99, 99, 99]),
    ]
    expect(buildKpis(items(), [], facts, host)[0]?.series).toEqual([
      3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ])
  })

  it('reads memory used from the available share in the series', () => {
    const facts = factSeries(host, 'sys.mem', [30, 20])
    expect(buildKpis(items(), [], facts, host)[1]?.series).toEqual([70, 80])
  })

  it('says there is no swap when the total is zero, and keeps a missing check as no value', () => {
    const none = [
      item({ host, check: 'sys.swap', value: 0, unit: '%', data: { total: 0, used: 0 } }),
    ]
    const kpis = buildKpis(none, [], [], host)
    expect(kpis[3]?.detail).toEqual({ kind: 'noSwap' })
    expect(kpis[0]).toMatchObject({ value: null, level: 'unknown' })
  })

  it('reports why a reading is missing and how old a kept one is', () => {
    const blind = item({
      host,
      check: 'sys.load',
      level: { level: 'unknown', reason: 'needs_perm' },
      disposition: { kind: 'stale', since_seq: 7 },
    })
    expect(buildKpis([blind], [], [], host)[0]).toMatchObject({
      reason: 'needs_perm',
      staleSince: 7,
    })
  })
})

describe('fullestDisk', () => {
  it('picks the fullest filesystem and prefers the root on a tie', () => {
    const list = [
      item({ check: 'disk.fs', target: '/data', data: { pct: 60 } }),
      item({ check: 'disk.fs', target: '/', data: { pct: 60 } }),
      item({ check: 'disk.fs', target: '/boot', data: { pct: 30 } }),
    ]
    expect(fullestDisk(list)?.key.target).toBe('/')
    expect(
      fullestDisk([...list, item({ check: 'disk.fs', target: '/big', data: { pct: 91 } })])?.key
        .target,
    ).toBe('/big')
  })
})
