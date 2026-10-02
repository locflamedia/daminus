import { describe, expect, it } from 'vitest'
import {
  barLayout,
  clampPercent,
  defaultRows,
  diskTreemap,
  donutSegments,
  gaugeGeometry,
  issueColumns,
  orderTreemap,
  stackShares,
  tileForm,
  treemapRows,
} from './chart-layout'

describe('defaultRows', () => {
  it('splits into two rows, the first the shorter', () => {
    expect(defaultRows(5)).toEqual([2, 3])
    expect(defaultRows(4)).toEqual([2, 2])
    expect(defaultRows(2)).toEqual([1, 1])
    expect(defaultRows(1)).toEqual([1])
    expect(defaultRows(0)).toEqual([])
  })
})

describe('treemapRows', () => {
  const items = [
    { id: 'uploads', value: 2.6 },
    { id: 'logs', value: 0.9 },
    { id: 'app', value: 1.1 },
    { id: 'git', value: 0.4 },
    { id: 'other', value: 0.4 },
  ]

  it('reproduces the two rows of the Disk board', () => {
    const tiles = treemapRows(items)
    const by = Object.fromEntries(tiles.map((t) => [t.item.id, t.rect]))
    // First row 3.5 of 5.4 GB tall, the second 1.9.
    expect(by.uploads?.h).toBeCloseTo(3.5 / 5.4, 6)
    expect(by.app?.h).toBeCloseTo(1.9 / 5.4, 6)
    expect(by.app?.y).toBeCloseTo(3.5 / 5.4, 6)
    // Widths are shares of the row.
    expect(by.uploads?.w).toBeCloseTo(2.6 / 3.5, 6)
    expect(by.logs?.x).toBeCloseTo(2.6 / 3.5, 6)
    expect(by.git?.x).toBeCloseTo(1.1 / 1.9, 6)
    expect(by.other?.x).toBeCloseTo(1.5 / 1.9, 6)
  })

  it('tiles the whole box with no overlap', () => {
    const tiles = treemapRows(items)
    const area = tiles.reduce((sum, t) => sum + t.rect.w * t.rect.h, 0)
    expect(area).toBeCloseTo(1, 9)
  })

  it('keeps the given order and drops empty values', () => {
    const tiles = treemapRows([
      { id: 'a', value: 0 },
      { id: 'b', value: 3 },
      { id: 'c', value: Number.NaN },
      { id: 'd', value: 1 },
    ])
    expect(tiles.map((t) => t.item.id)).toEqual(['b', 'd'])
    expect(tiles.map((t) => t.rect.row)).toEqual([0, 1])
  })

  it('follows the row sizes the caller gives, and adds a row for the rest', () => {
    const tiles = treemapRows(items, [3])
    expect(tiles.map((t) => t.rect.row)).toEqual([0, 0, 0, 1, 1])
    expect(treemapRows(items, [1, 1, 1, 1, 1]).every((t) => t.rect.w === 1)).toBe(true)
  })

  it('is empty when there is nothing to size', () => {
    expect(treemapRows([])).toEqual([])
    expect(treemapRows([{ value: 0 }])).toEqual([])
  })
})

describe('orderTreemap', () => {
  const folders = [
    { id: 'logs', value: 0.9, grow: true, growth: 0.9 },
    { id: 'uploads', value: 2.6, grow: true, growth: 0.04 },
    { id: 'other', value: 0.4, other: true },
    { id: 'app', value: 1.1 },
    { id: 'git', value: 0.4 },
  ]

  it('sorts by size, pulls the fastest grower behind the largest and keeps the rest last', () => {
    expect(orderTreemap(folders).map((f) => f.id)).toEqual([
      'uploads',
      'logs',
      'app',
      'git',
      'other',
    ])
  })

  it('keeps the largest first when it is also the fastest grower', () => {
    const ids = orderTreemap([
      { id: 'a', value: 3, grow: true, growth: 2 },
      { id: 'b', value: 2, grow: true, growth: 1 },
      { id: 'c', value: 1 },
    ]).map((f) => f.id)
    expect(ids).toEqual(['a', 'b', 'c'])
  })

  it('leaves the order by size alone when nothing grew, and drops empty folders', () => {
    const ids = orderTreemap([
      { id: 'a', value: 1 },
      { id: 'b', value: 3 },
      { id: 'z', value: 0 },
    ]).map((f) => f.id)
    expect(ids).toEqual(['b', 'a'])
  })
})

describe('diskTreemap', () => {
  const folders = [
    { id: 'uploads', value: 2.6 },
    { id: 'logs', value: 0.9, grow: true, growth: 0.9 },
    { id: 'app', value: 1.1 },
    { id: 'git', value: 0.4 },
    { id: 'other', value: 0.4, other: true },
  ]

  it('takes half the tiles, rounded down, for row one and two thirds of the height', () => {
    const tiles = diskTreemap(folders)
    expect(tiles.map((t) => [t.item.id, t.rect.row])).toEqual([
      ['uploads', 0],
      ['logs', 0],
      ['app', 1],
      ['git', 1],
      ['other', 1],
    ])
    expect(tiles[0]?.rect.h).toBeCloseTo(2 / 3, 9)
    expect(tiles[2]?.rect.y).toBeCloseTo(2 / 3, 9)
    expect(tiles[2]?.rect.h).toBeCloseTo(1 / 3, 9)
  })

  it('makes a tile as wide as its share of the row', () => {
    const tiles = diskTreemap(folders)
    expect(tiles[0]?.rect.w).toBeCloseTo(2.6 / 3.5, 9)
    expect(tiles[1]?.rect.x).toBeCloseTo(2.6 / 3.5, 9)
    expect(tiles[3]?.rect.x).toBeCloseTo(1.1 / 1.9, 9)
  })

  it('gives a single folder the whole box', () => {
    const [only] = diskTreemap([{ value: 4 }])
    expect(only?.rect).toEqual({ x: 0, y: 0, w: 1, h: 1, row: 0 })
  })
})

describe('tileForm', () => {
  it('shows name and size when both fit', () => {
    expect(tileForm(200, 100, 60)).toBe('full')
  })

  it('shows the name alone when the size does not fit the width or the height', () => {
    expect(tileForm(70, 100, 62)).toBe('name')
    expect(tileForm(200, 50, 60)).toBe('name')
  })

  it('shows nothing under 40 px wide', () => {
    expect(tileForm(39, 100, 0)).toBe('none')
    expect(tileForm(40, 100, 0)).toBe('full')
  })
})

describe('donutSegments', () => {
  const parts = [{ value: 27.2 }, { value: 18.2 }, { value: 12.4 }, { value: 9.7 }, { value: 6.1 }]

  it('draws one arc per part with shares that sum to one', () => {
    const segments = donutSegments(parts)
    expect(segments).toHaveLength(5)
    expect(segments.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1, 9)
    expect(segments[0]?.d.startsWith('M')).toBe(true)
  })

  it('starts the first segment past half a gap and a cap from 12 o clock', () => {
    // 3 deg gap + 9 deg cap = 12 deg: x = 85 + 64 sin 12.
    const d = donutSegments([{ value: 1 }, { value: 1 }])[0]?.d ?? ''
    const x = Number(/^M([\d.]+) /.exec(d)?.[1])
    expect(x).toBeCloseTo(85 + 64 * Math.sin((12 * Math.PI) / 180), 1)
  })

  it('still draws a dot for a segment shorter than its caps', () => {
    const segments = donutSegments([{ value: 99 }, { value: 0.5 }])
    expect(segments).toHaveLength(2)
    expect(segments[1]?.d).toMatch(/^M[\d.]+ [\d.]+ A64 64/)
  })

  it('skips empty parts and has nothing without a total', () => {
    expect(donutSegments([{ value: 0 }])).toEqual([])
    expect(donutSegments([{ value: 0 }, { value: 4 }])).toHaveLength(1)
  })

  it('takes shares of a total the caller gives', () => {
    const [segment] = donutSegments([{ value: 25 }], { total: 100 })
    expect(segment?.share).toBe(0.25)
  })
})

describe('gaugeGeometry', () => {
  it('holds the value to 0..100', () => {
    expect(clampPercent(-4)).toBe(0)
    expect(clampPercent(240)).toBe(100)
    expect(clampPercent(Number.NaN)).toBe(0)
  })

  it('leaves the unfilled share of the arc as the dash offset', () => {
    expect(gaugeGeometry(92).dashOffset).toBe(0.08)
    expect(gaugeGeometry(0).dashOffset).toBe(1)
    expect(gaugeGeometry(100).dashOffset).toBe(0)
  })

  it('turns the knob through 270 degrees at most', () => {
    expect(gaugeGeometry(50).knobAngle).toBe(135)
    expect(gaugeGeometry(100).knobAngle).toBe(270)
    expect(gaugeGeometry(0).knobAngle).toBe(0)
  })

  it('draws the track of the board', () => {
    expect(gaugeGeometry(10).track).toBe('M33.2 106.8 A52 52 0 1 1 106.8 106.8')
  })
})

describe('stackShares', () => {
  it('gives each part its share of 100', () => {
    expect(stackShares([52, 25, 15, 5, 3])).toEqual([52, 25, 15, 5, 3])
    const half = stackShares([1, 1])
    expect(half).toEqual([50, 50])
  })

  it('gives nothing to negative or empty input', () => {
    expect(stackShares([0, 0])).toEqual([0, 0])
    expect(stackShares([-5, 5])).toEqual([0, 100])
  })
})

describe('barLayout', () => {
  const duration = [2.9, 3.1, 2.7, 3.4, 2.6, 2.8, 3.0, 2.4, 2.5, 2.3, 2.6, 2.4, 3.0, 2.2]

  it('sizes bars against the tallest plus a little headroom', () => {
    const { bars, max } = barLayout(duration)
    expect(max).toBeCloseTo(3.4 * 1.06, 9)
    // 144 px track: the tallest bar fills 94 % of it.
    expect(bars[3]?.h).toBeCloseTo(144 / 1.06, 0)
    expect(bars[13]?.y).toBeCloseTo(160 - (2.2 / max) * 144, 0)
  })

  it('spreads 14 bars of 14 px from 8 to 372', () => {
    const { bars } = barLayout(duration)
    expect(bars[0]?.x).toBe(8)
    expect((bars[13]?.x ?? 0) + 14).toBeCloseTo(372, 0)
  })

  it('draws the average as a line at the mean', () => {
    const { avgY, max } = barLayout([2, 4])
    expect(avgY).toBeCloseTo(160 - (3 / max) * 144, 0)
  })

  it('never rounds a bar more than it is tall', () => {
    const { bars } = barLayout([0.01, 5])
    expect(bars[0]?.r).toBeLessThan(7)
    expect(bars[1]?.r).toBe(7)
  })

  it('copes with no data and with zeros', () => {
    expect(barLayout([])).toMatchObject({ bars: [], avgY: 160 })
    expect(barLayout([0, 0]).bars.every((b) => b.h === 0)).toBe(true)
  })
})

describe('issueColumns', () => {
  it('stacks critical under warning under info, 16 px an issue', () => {
    const [col] = issueColumns([{ crit: 2, warn: 3, info: 1 }])
    expect(col).toEqual([
      { tone: 'crit', count: 2, height: 32 },
      { tone: 'warn', count: 3, height: 48 },
      { tone: 'info', count: 1, height: 16 },
    ])
  })

  it('leaves out a tone with no issues', () => {
    const [col] = issueColumns([{ crit: 0, warn: 3, info: 0 }])
    expect(col?.map((s) => s.tone)).toEqual(['warn'])
  })

  it('shrinks the unit for every scan when the busiest would not fit', () => {
    const cols = issueColumns([
      { crit: 10, warn: 10, info: 10 },
      { crit: 0, warn: 5, info: 0 },
    ])
    // 30 issues and two 2 px gaps in 120 px.
    const unit = (120 - 4) / 30
    expect(cols[0]?.[0]?.height).toBeCloseTo(10 * unit, 1)
    expect(cols[1]?.[0]?.height).toBeCloseTo(5 * unit, 1)
  })

  it('has an empty column for a clean scan', () => {
    expect(issueColumns([{ crit: 0, warn: 0, info: 0 }])).toEqual([[]])
  })
})
