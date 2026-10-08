import { describe, expect, it } from 'vitest'
import {
  areaPath,
  arcPath,
  gridValues,
  linePoints,
  monotonePath,
  paddedDomain,
  polar,
  scaleLinear,
  sparkline,
  timeShares,
  type Point,
} from './chart-geometry'

describe('scaleLinear', () => {
  it('maps the domain onto the range, in either direction', () => {
    expect(scaleLinear([0, 10], [0, 100])(5)).toBe(50)
    expect(scaleLinear([0, 10], [100, 0])(2.5)).toBe(75)
  })

  it('puts a flat domain in the middle of the range', () => {
    expect(scaleLinear([3, 3], [0, 10])(3)).toBe(5)
  })
})

describe('linePoints', () => {
  it('spaces scans evenly and puts the largest value on the top edge', () => {
    const points = linePoints([1, 3, 2], { x0: 10, x1: 30, y0: 0, y1: 100 }, [1, 3])
    expect(points).toEqual([
      [10, 100],
      [20, 0],
      [30, 50],
    ])
  })

  it('centres a single scan', () => {
    expect(linePoints([4], { x0: 0, x1: 10, y0: 0, y1: 10 }, [0, 8])).toEqual([[5, 5]])
  })
})

describe('monotonePath', () => {
  it('is empty without points and a bare move for one', () => {
    expect(monotonePath([])).toBe('')
    expect(monotonePath([[3, 4]])).toBe('M3 4')
  })

  it('draws the Fritsch-Carlson curve through a peak', () => {
    const p: Point[] = [
      [0, 0],
      [10, 10],
      [20, 0],
    ]
    expect(monotonePath(p)).toBe('M0 0 C3.3 3.3 6.7 10 10 10 C13.3 10 16.7 3.3 20 0')
  })

  /** A point on the cubic segment i, at t. */
  function sample(path: string, t: number): number[] {
    const segments = [...path.matchAll(/C([\d. -]+)/g)].map((m) => (m[1] ?? '').trim().split(' '))
    const ys: number[] = []
    let prevY = Number(/^M[\d.-]+ ([\d.-]+)/.exec(path)?.[1])
    for (const seg of segments) {
      const [, y1, , y2, , y3] = seg.map(Number) as [number, number, number, number, number, number]
      const u = 1 - t
      ys.push(u ** 3 * prevY + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3 * y3)
      prevY = y3
    }
    return ys
  }

  it('never rises above the highest or falls below the lowest value', () => {
    // A jump after a long flat run is the case where a plain spline overshoots.
    const values = [7.19, 7.24, 7.28, 7.3, 7.33, 7.34, 7.36, 7.4, 8.43]
    const points = linePoints(values, { x0: 0, x1: 100, y0: 0, y1: 100 }, [7, 9])
    const path = monotonePath(points)
    const ys = points.map((p) => p[1])
    for (let t = 0; t <= 1; t += 0.05) {
      for (const y of sample(path, t)) {
        expect(y).toBeLessThanOrEqual(Math.max(...ys) + 0.1)
        expect(y).toBeGreaterThanOrEqual(Math.min(...ys) - 0.1)
      }
    }
  })

  it('keeps a flat stretch flat', () => {
    const path = monotonePath([
      [0, 5],
      [10, 5],
      [20, 5],
    ])
    expect(path).toBe('M0 5 C3.3 5 6.7 5 10 5 C13.3 5 16.7 5 20 5')
  })

  it('survives two scans at the same x', () => {
    expect(
      monotonePath([
        [0, 0],
        [0, 4],
        [10, 8],
      ]),
    ).toMatch(/^M0 0 C/)
  })
})

describe('areaPath', () => {
  it('closes the curve down to the baseline', () => {
    const d = areaPath(
      [
        [0, 5],
        [10, 2],
      ],
      24,
    )
    expect(d.endsWith(' L10 24 L0 24 Z')).toBe(true)
    expect(areaPath([], 24)).toBe('')
  })
})

describe('polar and arcPath', () => {
  it('measures angles clockwise from 12 o clock', () => {
    const [x, y] = polar(0, 0, 10, 0)
    expect(x).toBeCloseTo(0)
    expect(y).toBeCloseTo(-10)
    const [x2, y2] = polar(0, 0, 10, 90)
    expect(x2).toBeCloseTo(10)
    expect(y2).toBeCloseTo(0)
  })

  it('draws the gauge track of the board', () => {
    expect(arcPath(70, 70, 52, -135, 135)).toBe('M33.2 106.8 A52 52 0 1 1 106.8 106.8')
  })

  it('flags the large arc past a half turn only', () => {
    expect(arcPath(0, 0, 10, 0, 90)).toContain(' 0 0 1 ')
    expect(arcPath(0, 0, 10, 0, 200)).toContain(' 0 1 1 ')
  })
})

describe('gridValues', () => {
  it('gives round values strictly inside the range', () => {
    expect(gridValues(6.5, 8.75)).toEqual([7, 7.5, 8, 8.5])
    expect(gridValues(30, 100)).toEqual([40, 60, 80])
  })

  it('keeps to the count asked for', () => {
    expect(gridValues(0, 1000, 3).length).toBeLessThanOrEqual(3)
    expect(gridValues(0, 1000, 3).length).toBeGreaterThan(0)
  })

  it('has nothing for an empty or backwards range', () => {
    expect(gridValues(5, 5)).toEqual([])
    expect(gridValues(9, 1)).toEqual([])
  })

  it('does not drift on decimals', () => {
    for (const v of gridValues(0.05, 0.45)) expect(v).toBe(Number(v.toFixed(2)))
  })
})

describe('paddedDomain', () => {
  it('adds headroom of the range on both sides', () => {
    const [lo, hi] = paddedDomain([10, 20], 0.15, 0)
    expect(lo).toBeCloseTo(8.5)
    expect(hi).toBeCloseTo(21.5)
  })

  it('pads a flat series by a share of its size, and a flat zero by one', () => {
    expect(paddedDomain([100, 100], 0.15, 0.05)).toEqual([95, 105])
    expect(paddedDomain([0, 0])).toEqual([-1, 1])
    expect(paddedDomain([])).toEqual([0, 1])
  })
})

describe('sparkline', () => {
  it('has nothing to draw with fewer than three scans', () => {
    expect(sparkline([1, 2])).toBeNull()
    expect(sparkline([])).toBeNull()
    expect(sparkline([1, Number.NaN, 3])).toBeNull()
  })

  it('draws the last nine scans, with the end at the right inset', () => {
    const values = Array.from({ length: 20 }, (_, i) => i)
    const spark = sparkline(values, { width: 240, height: 24 })
    expect(spark).not.toBeNull()
    expect(spark?.end[0]).toBe(236)
    expect(spark?.line.match(/C/g)).toHaveLength(8)
    expect(spark?.fill.endsWith('L236 24 L4 24 Z')).toBe(true)
  })

  it('keeps the dot of a rising series above the baseline and inside the tile', () => {
    const spark = sparkline([1, 2, 3, 4], { height: 24 })
    expect(spark?.end[1]).toBeGreaterThan(0)
    expect(spark?.end[1]).toBeLessThan(12)
  })
})

describe('timeShares and time-placed points', () => {
  it('places moments between the first and the last by the clock', () => {
    expect(timeShares([0, 1, 5, 10])).toEqual([0, 0.1, 0.5, 1])
    expect(timeShares([7])).toEqual([0.5])
    expect(timeShares([3, 3])).toEqual([0.5, 0.5])
  })

  it('puts uneven scans where their time is, not evenly', () => {
    const box = { x0: 0, x1: 100, y0: 0, y1: 10 }
    const points = linePoints([1, 2, 3], box, [0, 4], timeShares([0, 1, 10]))
    expect(points.map((p) => p[0])).toEqual([0, 10, 100])
    expect(linePoints([1, 2, 3], box, [0, 4]).map((p) => p[0])).toEqual([0, 50, 100])
  })
})
