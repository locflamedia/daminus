// Series of one check's facts across scans, for the sparklines and curves of the project tabs.
import type { ScanFact } from '@/api'
import { dataOf, num, pairs } from './project-facts'

export interface SeriesPoint {
  seq: number
  at: string
  value: number
}

export interface FactMatch {
  check: string
  host?: string
  target?: string
}

/** Facts of one key, oldest first, one per scan; a fact that could not answer is left out. */
export function factsFor(facts: readonly ScanFact[], match: FactMatch): ScanFact[] {
  return facts
    .filter(
      (f) =>
        f.fact.check === match.check &&
        (match.host === undefined || f.host === match.host) &&
        (match.target === undefined || f.fact.target === match.target) &&
        !f.fact.unknown,
    )
    .sort((a, b) => a.seq - b.seq)
}

/** The numeric `value` of each fact. */
export function valueSeries(facts: readonly ScanFact[]): SeriesPoint[] {
  return facts.flatMap((f) => {
    const value = num(f.fact.value)
    return value === null ? [] : [{ seq: f.seq, at: f.at, value }]
  })
}

/** A number picked from each fact's data (`data.pct`). */
export function dataSeries(facts: readonly ScanFact[], field: string): SeriesPoint[] {
  return facts.flatMap((f) => {
    const value = num(dataOf(f.fact)[field])
    return value === null ? [] : [{ seq: f.seq, at: f.at, value }]
  })
}

/** The last `n` points. */
export function lastPoints<T>(points: readonly T[], n: number): T[] {
  return points.slice(Math.max(0, points.length - n))
}

/** Newest value minus the one before it; `null` with fewer than two points. */
export function lastChange(points: readonly SeriesPoint[]): number | null {
  const a = points[points.length - 2]
  const b = points[points.length - 1]
  return a && b ? b.value - a.value : null
}

/** Newest minus oldest. */
export function totalChange(points: readonly SeriesPoint[]): number | null {
  const a = points[0]
  const b = points[points.length - 1]
  return a && b && points.length > 1 ? b.value - a.value : null
}

/** Bytes per name in a fact's `top` list. */
export function topOf(fact: ScanFact | undefined): Map<string, number> {
  return new Map(pairs(dataOf(fact?.fact).top).map((p) => [p.name, p.bytes]))
}

/** The median of the values; `null` when empty. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? (s[mid] ?? null) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2
}
