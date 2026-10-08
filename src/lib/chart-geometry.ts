// Pure geometry for the charts: scales, the monotone curve, arcs and round gridlines.
// Everything returns numbers and SVG path text, so the maths is tested without a DOM and
// the components only place what these functions give them.

export type Point = readonly [x: number, y: number]

/** One decimal, as the boards print their paths. */
export function round1(v: number): number {
  return Math.round(v * 10) / 10
}

/** Maps `domain` onto `range`; a flat domain maps everything to the middle of the range. */
export function scaleLinear(
  domain: readonly [number, number],
  range: readonly [number, number],
): (v: number) => number {
  const [d0, d1] = domain
  const [r0, r1] = range
  if (d1 === d0) return () => (r0 + r1) / 2
  return (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0)
}

export interface Box {
  x0: number
  x1: number
  /** Top edge (the largest value). */
  y0: number
  /** Bottom edge (the smallest value). */
  y1: number
}

/**
 * Where each moment falls between the first and the last, 0 to 1; the middle for a single
 * moment or when they are all the same.
 */
export function timeShares(times: readonly number[]): number[] {
  const first = times[0]
  const last = times[times.length - 1]
  if (first === undefined || last === undefined || last === first) return times.map(() => 0.5)
  return times.map((t) => (t - first) / (last - first))
}

/**
 * Evenly spaced x (a scan is a point, not a moment), y from `domain` onto the box. With
 * `shares` (see `timeShares`) the x follows the clock instead, for charts of scans that
 * happen on demand and unevenly.
 */
export function linePoints(
  values: readonly number[],
  box: Box,
  domain: readonly [number, number],
  shares?: readonly number[],
): Point[] {
  const y = scaleLinear(domain, [box.y1, box.y0])
  const n = values.length
  return values.map((v, i) => {
    const share = shares?.[i]
    const x =
      share !== undefined
        ? box.x0 + (box.x1 - box.x0) * share
        : n === 1
          ? (box.x0 + box.x1) / 2
          : box.x0 + ((box.x1 - box.x0) * i) / (n - 1)
    return [x, y(v)]
  })
}

/**
 * The curve of every chart: a monotone cubic (Fritsch-Carlson). It is smooth and never rises
 * above the highest or falls below the lowest real value, so a curve cannot invent a peak.
 */
export function monotonePath(points: readonly Point[]): string {
  const n = points.length
  const first = points[0]
  if (!first) return ''
  const start = `M${round1(first[0])} ${round1(first[1])}`
  if (n === 1) return start

  const d: number[] = []
  for (let i = 0; i < n - 1; i++) {
    const a = points[i] as Point
    const b = points[i + 1] as Point
    const dx = b[0] - a[0]
    d.push(dx === 0 ? 0 : (b[1] - a[1]) / dx)
  }
  const m: number[] = new Array<number>(n).fill(0)
  m[0] = d[0] ?? 0
  m[n - 1] = d[n - 2] ?? 0
  for (let i = 1; i < n - 1; i++) {
    const prev = d[i - 1] ?? 0
    const next = d[i] ?? 0
    m[i] = prev * next <= 0 ? 0 : (prev + next) / 2
  }
  for (let i = 0; i < n - 1; i++) {
    const slope = d[i] ?? 0
    if (slope === 0) {
      m[i] = 0
      m[i + 1] = 0
      continue
    }
    const a = (m[i] ?? 0) / slope
    const b = (m[i + 1] ?? 0) / slope
    const s = a * a + b * b
    if (s > 9) {
      const t = 3 / Math.sqrt(s)
      m[i] = t * a * slope
      m[i + 1] = t * b * slope
    }
  }

  let out = start
  for (let i = 0; i < n - 1; i++) {
    const a = points[i] as Point
    const b = points[i + 1] as Point
    const dx = (b[0] - a[0]) / 3
    out +=
      ` C${round1(a[0] + dx)} ${round1(a[1] + (m[i] ?? 0) * dx)}` +
      ` ${round1(b[0] - dx)} ${round1(b[1] - (m[i + 1] ?? 0) * dx)}` +
      ` ${round1(b[0])} ${round1(b[1])}`
  }
  return out
}

/** The curve closed down to `baseline`, for the soft fill under a line. */
export function areaPath(points: readonly Point[], baseline: number): string {
  const first = points[0]
  const last = points[points.length - 1]
  if (!first || !last) return ''
  return `${monotonePath(points)} L${round1(last[0])} ${baseline} L${round1(first[0])} ${baseline} Z`
}

/** A point on a circle; 0 degrees is 12 o'clock and angles grow clockwise. */
export function polar(cx: number, cy: number, r: number, deg: number): Point {
  const a = ((deg - 90) * Math.PI) / 180
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
}

/** An arc from `a0` to `a1` degrees, clockwise. */
export function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const s = polar(cx, cy, r, a0)
  const e = polar(cx, cy, r, a1)
  return `M${round1(s[0])} ${round1(s[1])} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${round1(e[0])} ${round1(e[1])}`
}

/** The steps a gridline may take inside a decade, so lines sit at round values. */
const STEPS = [1, 2, 2.5, 5, 10]

/**
 * Gridline values strictly inside (`min`, `max`) at round steps: the smallest step that keeps
 * the count at or under `most` (the boards draw two to four dotted lines).
 */
export function gridValues(min: number, max: number, most = 4): number[] {
  if (!(max > min) || most < 1) return []
  const span = max - min
  const exp = Math.floor(Math.log10(span))
  for (let e = exp - 2; e <= exp + 1; e++) {
    for (const base of STEPS) {
      const step = base * 10 ** e
      const out: number[] = []
      // Integer multiples avoid 0.1 + 0.2 style drift in the values.
      for (let k = Math.floor(min / step) + 1; k * step < max; k++) {
        out.push(Math.round(k * step * 1e9) / 1e9)
      }
      if (out.length > 0 && out.length <= most) return out
    }
  }
  return []
}

/** The extent of a series, padded by `headroom` of its range (or `floor` of its size when flat). */
export function paddedDomain(
  values: readonly number[],
  headroom = 0.15,
  floor = 0.05,
): [number, number] {
  if (values.length === 0) return [0, 1]
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const mid = (lo + hi) / 2
  let pad = Math.max((hi - lo) * headroom, Math.abs(mid) * floor)
  if (pad === 0) pad = 1
  return [lo - pad, hi + pad]
}

export interface SparkOptions {
  /** Drawing width in user units; the SVG stretches it to the tile. */
  width?: number
  height?: number
  /** Inset on every side, so the stroke and the end dot are not clipped. */
  inset?: number
  /** Scans drawn: the most recent N, evenly spaced. */
  last?: number
  headroom?: number
}

export interface Spark {
  line: string
  fill: string
  /** The newest point, where the white dot sits. */
  end: Point
  width: number
  height: number
}

/** A sparkline needs at least three scans; with fewer the card shows only the value. */
export const SPARK_MIN_POINTS = 3

/**
 * The tile sparkline: the last nine scans on their own min-to-max scale with headroom and no
 * axis. `null` when there are fewer than three scans.
 */
export function sparkline(values: readonly number[], options: SparkOptions = {}): Spark | null {
  const { width = 240, height = 24, inset = 4, last = 9, headroom = 0.15 } = options
  const recent = values.filter((v) => Number.isFinite(v)).slice(-last)
  if (recent.length < SPARK_MIN_POINTS) return null
  const points = linePoints(
    recent,
    { x0: inset, x1: width - inset, y0: inset, y1: height - inset },
    paddedDomain(recent, headroom, 0.06),
  )
  return {
    line: monotonePath(points),
    fill: areaPath(points, height),
    end: points[points.length - 1] as Point,
    width,
    height,
  }
}
