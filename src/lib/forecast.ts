// "Disk reaches 90% in about 9 days": a straight line through the last scans, read on real
// time (scans happen on demand and unevenly, so the x axis is the clock, not the scan number).
export interface TimedValue {
  /** When the value was read, in milliseconds. */
  at: number
  value: number
}

const DAY_MS = 86_400_000

/** How many of the newest points the line is fitted to. */
export const FORECAST_POINTS = 6

/** Slope in value per day over the newest points (least squares); `null` with fewer than two. */
export function slopePerDay(points: readonly TimedValue[]): number | null {
  const used = points.slice(-FORECAST_POINTS)
  if (used.length < 2) return null
  const t0 = used[0]?.at ?? 0
  const xs = used.map((p) => (p.at - t0) / DAY_MS)
  const meanX = xs.reduce((a, b) => a + b, 0) / xs.length
  const meanY = used.reduce((a, p) => a + p.value, 0) / used.length
  let num = 0
  let den = 0
  used.forEach((p, i) => {
    const dx = (xs[i] ?? 0) - meanX
    num += dx * (p.value - meanY)
    den += dx * dx
  })
  return den === 0 ? null : num / den
}

/**
 * Whole days until the line reaches `limit`, rounded up; `null` when the value is not rising
 * or there is too little to fit, `0` when it is already at the limit.
 */
export function daysUntil(points: readonly TimedValue[], limit: number): number | null {
  const last = points[points.length - 1]
  if (!last) return null
  if (last.value >= limit) return 0
  const slope = slopePerDay(points)
  if (slope === null || slope <= 0) return null
  return Math.max(1, Math.ceil((limit - last.value) / slope))
}
