import { describe, expect, it } from 'vitest'
import type { ScanFact } from '@/api'
import {
  dataSeries,
  factsFor,
  lastChange,
  lastPoints,
  median,
  totalChange,
  valueSeries,
} from './project-series'

const f = (seq: number, value: number | null, host = 'h', unknown = false): ScanFact =>
  ({
    seq,
    at: '',
    host,
    fact: {
      check: 'c',
      target: 't',
      value,
      data: { pct: value },
      ...(unknown ? { unknown: 'timeout' } : {}),
    },
  }) as unknown as ScanFact

describe('series', () => {
  it('keeps one key, oldest first, without results that could not answer', () => {
    const list = factsFor([f(3, 3), f(1, 1), f(2, 2, 'other'), f(4, 4, 'h', true)], {
      check: 'c',
      host: 'h',
    })
    expect(list.map((x) => x.seq)).toEqual([1, 3])
  })

  it('reads values and data fields, skipping the missing', () => {
    expect(valueSeries([f(1, 5), f(2, null)]).map((p) => p.value)).toEqual([5])
    expect(dataSeries([f(1, 7)], 'pct').map((p) => p.value)).toEqual([7])
  })

  it('computes the last and the total change', () => {
    const pts = valueSeries([f(1, 1), f(2, 4), f(3, 9)])
    expect(lastChange(pts)).toBe(5)
    expect(totalChange(pts)).toBe(8)
    expect(lastChange(pts.slice(0, 1))).toBeNull()
  })

  it('takes the last n points and the median', () => {
    expect(lastPoints([1, 2, 3, 4], 2)).toEqual([3, 4])
    expect(median([3, 1, 2])).toBe(2)
    expect(median([1, 2, 3, 4])).toBe(2.5)
    expect(median([])).toBeNull()
  })
})
