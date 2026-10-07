// Geometry of the three History curves: one shared time axis (scans are uneven, so their x is
// their time, not their rank), each curve on its own value scale, and the scan nearest to a
// pointer or a key press. Pure numbers and path text, so the maths is tested without a DOM.
import { areaPath, monotonePath, paddedDomain, scaleLinear, type Point } from './chart-geometry'
import type { SeriesPoint } from './history-series'

export const CHART_W = 560
export const CHART_H = 128
/** Space the drawing keeps from the sides and the top, so strokes and dots are not clipped. */
export const CHART_INSET = { x: 6, top: 8, bottom: 8 } as const

export interface TimeAxis {
  /** The scans of the window, oldest first, with their time. */
  scans: readonly { seq: number; at: number }[]
  /** Fraction (0 to 1) of the width a time sits at. */
  fraction: (at: number) => number
}

export function timeAxis(scans: readonly { seq: number; at: number }[]): TimeAxis {
  const first = scans[0]?.at ?? 0
  const last = scans[scans.length - 1]?.at ?? first
  const span = last - first
  return { scans, fraction: (at) => (span <= 0 ? 0.5 : (at - first) / span) }
}

export function xOf(axis: TimeAxis, at: number): number {
  const w = CHART_W - 2 * CHART_INSET.x
  return CHART_INSET.x + axis.fraction(at) * w
}

export interface DrawnSeries {
  line: string
  area: string
  points: Map<number, Point>
}

/** The curve, its soft fill and the point of every scan, on the value range of the series. */
export function drawSeries(points: readonly SeriesPoint[], axis: TimeAxis): DrawnSeries | null {
  if (points.length === 0) return null
  const [lo, hi] = paddedDomain(
    points.map((p) => p.value),
    0.15,
    0.05,
  )
  const y = scaleLinear([lo, hi], [CHART_H - CHART_INSET.bottom, CHART_INSET.top])
  const drawn: Point[] = points.map((p) => [xOf(axis, p.at), y(p.value)])
  return {
    line: monotonePath(drawn),
    area: areaPath(drawn, CHART_H),
    points: new Map(points.map((p, i) => [p.seq, drawn[i] as Point])),
  }
}

/** The scan nearest to a place on the axis (0 to 1 of the width). */
export function nearestScan(axis: TimeAxis, fraction: number): number | null {
  let best: { seq: number; gap: number } | null = null
  for (const s of axis.scans) {
    const gap = Math.abs(axis.fraction(s.at) - fraction)
    if (best === null || gap < best.gap) best = { seq: s.seq, gap }
  }
  return best?.seq ?? null
}
