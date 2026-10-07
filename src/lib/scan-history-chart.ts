// What the scan history draws from `history_list`: the issue columns, the list rows and the
// project filter. A project filter narrows the columns, the rows and the compare card together,
// using each scan's own per-project counts.
import type { HistoryView, ScanSummary } from '@/api'
import type { IssueCounts } from './chart-layout'
import { isUnreachable } from './rollups'

/** `null` is every project. */
export type ProjectFilter = string | null

/** Scans the chart and the list show at most (the newest ones). */
export const SHOWN_SCANS = 20

/** URL checks run from this Mac; they are not a host that can be reached or not. */
const LOCAL = '@local'

export function issueCounts(scan: ScanSummary, filter: ProjectFilter): IssueCounts {
  if (filter === null) return { crit: scan.counts.crit, warn: scan.counts.warn, info: scan.info }
  const project = scan.projects.find((p) => p.id === filter)
  return { crit: project?.crit ?? 0, warn: project?.warn ?? 0, info: project?.info ?? 0 }
}

/** Project ids of the kept scans, in the order the newest scan lists them, then the rest. */
export function projectIds(view: HistoryView | null): string[] {
  const seen: string[] = []
  for (const scan of [...(view?.scans ?? [])].reverse()) {
    for (const p of scan.projects) if (!seen.includes(p.id)) seen.push(p.id)
  }
  return seen
}

/** The newest scans that are shown, oldest first, and how many are kept in all. */
export function shownScans(view: HistoryView | null): { scans: ScanSummary[]; total: number } {
  const all = view?.scans ?? []
  return { scans: all.slice(-SHOWN_SCANS), total: all.length }
}

export interface HostsReached {
  reached: number
  total: number
}

/**
 * Hosts that answered in the scan, out of the hosts it asked. With a project filter only the
 * hosts the project uses count (`hosts` is that set); without one, every host of the scan.
 */
export function hostsReached(scan: ScanSummary, hosts: ReadonlySet<string> | null): HostsReached {
  let reached = 0
  let total = 0
  for (const [host, summary] of Object.entries(scan.hosts)) {
    if (host === LOCAL || !summary || (hosts && !hosts.has(host))) continue
    total += 1
    if (!isUnreachable(summary.outcome)) reached += 1
  }
  return { reached, total }
}

export function scanDurationMs(scan: ScanSummary): number {
  return Math.max(0, Date.parse(scan.finished_at) - Date.parse(scan.started_at))
}

export interface ScanRow extends IssueCounts {
  seq: number
  startedAt: string
  durationMs: number
  hosts: HostsReached
}

/** The list rows, newest first. */
export function scanRows(
  scans: readonly ScanSummary[],
  filter: ProjectFilter,
  hosts: ReadonlySet<string> | null,
): ScanRow[] {
  return [...scans].reverse().map((scan) => ({
    seq: scan.seq,
    startedAt: scan.started_at,
    durationMs: scanDurationMs(scan),
    hosts: hostsReached(scan, hosts),
    ...issueCounts(scan, filter),
  }))
}

/** A scan with fewer hosts answering than were asked: its host count turns amber. */
export function hostsShort(hosts: HostsReached): boolean {
  return hosts.reached < hosts.total
}

export interface UnreachableRun {
  host: string
  /** The first scan of the run of scans, up to the newest, in which the host did not answer. */
  since: number
  /** How many scans the run covers. */
  scans: number
}

/** Hosts that did not answer the newest scan, and since which scan: their checks are missing from those bars. */
export function unreachableRuns(scans: readonly ScanSummary[]): UnreachableRun[] {
  const newest = scans[scans.length - 1]
  if (!newest) return []
  const runs: UnreachableRun[] = []
  for (const [host, summary] of Object.entries(newest.hosts)) {
    if (host === LOCAL || !summary || !isUnreachable(summary.outcome)) continue
    let length = 0
    for (let i = scans.length - 1; i >= 0; i--) {
      const was = scans[i]?.hosts[host]
      if (!was || !isUnreachable(was.outcome)) break
      length += 1
    }
    runs.push({ host, since: scans[scans.length - length]?.seq ?? newest.seq, scans: length })
  }
  return runs.sort((a, b) => a.host.localeCompare(b.host))
}
