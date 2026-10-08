// The window of the History tab: which scans the columns and charts cover, and which two scans
// are compared. The core keeps the scans; this only chooses among them.
import type { ScanSummary } from '@/api'

export const HISTORY_RANGES = ['7d', '30d', 'all'] as const
export type HistoryRange = (typeof HISTORY_RANGES)[number]

const DAY_MS = 86_400_000
const DAYS: Record<Exclude<HistoryRange, 'all'>, number> = { '7d': 7, '30d': 30 }

/** The scans (oldest first) that finished within the range, counted back from the newest scan. */
export function scansInRange(scans: readonly ScanSummary[], range: HistoryRange): ScanSummary[] {
  const last = scans[scans.length - 1]
  if (!last || range === 'all') return [...scans]
  const from = Date.parse(last.finished_at) - DAYS[range] * DAY_MS
  return scans.filter((s) => Date.parse(s.finished_at) >= from)
}

export interface ComparePair {
  /** The baseline every change is measured from. */
  from: number
  /** The scan compared with it. */
  to: number
}

/** How far back the baseline starts: four scans before the newest (the board compares #8 with #12). */
export const DEFAULT_BACK = 4

/** The newest scan against the one four scans before it, or the oldest when there are fewer. */
export function defaultPair(scans: readonly ScanSummary[]): ComparePair | null {
  const last = scans[scans.length - 1]
  if (!last) return null
  const base = scans[Math.max(0, scans.length - 1 - DEFAULT_BACK)] as ScanSummary
  return { from: base.seq, to: last.seq }
}

/** `pair` when both scans are still in the window, otherwise the default pair of the window. */
export function validPair(
  pair: ComparePair | null,
  scans: readonly ScanSummary[],
): ComparePair | null {
  const has = (seq: number) => scans.some((s) => s.seq === seq)
  if (pair && has(pair.from) && has(pair.to) && pair.from < pair.to) return pair
  return defaultPair(scans)
}
