// What the server page reads from the report and the raw facts: the host's items, how the host
// fared in the latest scan, and one check's values across scans. Nothing here grades anything:
// severity, delta and staleness come from the core.
import type { HostOutcome, Item, Report, ScanFact, ServerRollup } from '@/api'
import { dataOf, num } from './project-facts'
import { factsFor, lastPoints, type SeriesPoint } from './project-series'
import { isUnreachable } from './rollups'

export type HostState = 'missing' | 'not-scanned' | 'unreachable' | 'normal'

/** The host's own results, whoever owns them (a project or the server itself). */
export function hostItems(report: Report | null | undefined, host: string): Item[] {
  return (report?.items ?? []).filter((item) => item.key.host === host)
}

export function itemOf(items: readonly Item[], check: string, target?: string): Item | undefined {
  return items.find(
    (i) => i.key.check === check && (target === undefined || i.key.target === target),
  )
}

/**
 * How the latest scan treated the host. `missing` is a host the report does not know (a stale
 * link); `not-scanned` one left out of the scan (excluded, or not asked for).
 */
export function hostState(rollup: ServerRollup | undefined): HostState {
  if (!rollup) return 'missing'
  if (!rollup.included || !rollup.outcome) return 'not-scanned'
  return isUnreachable(rollup.outcome) ? 'unreachable' : 'normal'
}

/** The outcome when the host did not answer, for the words under the title. */
export function failedOutcome(rollup: ServerRollup | undefined): HostOutcome | null {
  return rollup?.outcome && isUnreachable(rollup.outcome) ? rollup.outcome : null
}

/** Cores, from `data.cores` of the load result. */
export function coresOf(items: readonly Item[]): number | null {
  const cores = num(dataOf(itemOf(items, 'sys.load')?.fact).cores)
  return cores !== null && cores > 0 ? cores : null
}

/** The distribution the load check read ("Ubuntu 24.04"); `null` when it could not. */
export function osOf(items: readonly Item[]): string | null {
  const os = dataOf(itemOf(items, 'sys.load')?.fact).os
  return typeof os === 'string' && os.trim() !== '' ? os.trim() : null
}

/** Seconds since boot, as the load check read them; `null` when it could not. */
export function uptimeOf(items: readonly Item[]): number | null {
  const up = num(dataOf(itemOf(items, 'sys.load')?.fact).uptime)
  return up !== null && up >= 0 ? up : null
}

/** One check on one host across the scans the facts cover, as value points, oldest first. */
export function hostSeries(
  facts: readonly ScanFact[],
  host: string,
  check: string,
  field: 'value' | `data.${string}` = 'value',
  target = '',
): SeriesPoint[] {
  const matching = factsFor(facts, { check, host, target })
  return matching.flatMap((f) => {
    const raw = field === 'value' ? f.fact.value : dataOf(f.fact)[field.slice(5)]
    const value = num(raw)
    return value === null ? [] : [{ seq: f.seq, at: f.at, value }]
  })
}

/** The newest `n` values of a series, for a sparkline. */
export function recentValues(points: readonly SeriesPoint[], n: number): number[] {
  return lastPoints(points, n).map((p) => p.value)
}
