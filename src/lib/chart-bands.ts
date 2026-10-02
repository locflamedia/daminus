// The band a measured value falls in, which decides the colour of its bar and its number:
// accent below the warn line, amber from it, rose from the crit line, grey when there is no
// reading. The same rule serves the server meters, the sparklines and the gauges.

export type Band = 'ok' | 'warn' | 'crit' | 'off'

export interface Thresholds {
  /** Value from which the reading is a warning. */
  warn: number
  /** Value from which it is critical. */
  crit: number
  /** True when a small value is the bad one (days of SSL left): the lines are "up to". */
  lowIsBad?: boolean
}

/** `null` and non-numbers are `off`: a missing reading is grey, never zero. */
export function bandOf(value: number | null | undefined, thresholds: Thresholds): Band {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'off'
  if (thresholds.lowIsBad) {
    if (value <= thresholds.crit) return 'crit'
    if (value <= thresholds.warn) return 'warn'
    return 'ok'
  }
  if (value >= thresholds.crit) return 'crit'
  if (value >= thresholds.warn) return 'warn'
  return 'ok'
}

/** Bar width in percent, held to 0..100; a missing value draws no bar. */
export function barWidth(pct: number | null | undefined): number {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return 0
  return Math.min(100, Math.max(0, pct))
}
