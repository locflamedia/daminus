// The compare card: what is new, fixed and unchanged between two scans, read from their
// reports. An issue is new when it is open in the newer scan and was not in the older, fixed
// when it was open in the older and answers ok in the newer, unchanged when it is open in both.
import type { Item, Report, ScanSummary } from '@/api'
import {
  hostsReached,
  scanDurationMs,
  type HostsReached,
  type ProjectFilter,
} from './scan-history-chart'
import { inFilter } from './scan-history-tally'
import { itemId, openLevel } from './server-issue'

export type CompareKind = 'new' | 'fixed' | 'still'

export interface CompareRow {
  id: string
  kind: CompareKind
  item: Item
  /** Who the issue belongs to: its project, or its server. */
  owner: string
  /** Scans it has been open, for an unchanged issue. */
  scans: number | null
}

export interface Compare {
  rows: CompareRow[]
  new: number
  fixed: number
  still: number
}

const KIND_ORDER: Record<CompareKind, number> = { new: 0, fixed: 1, still: 2 }

function ownerOf(item: Item): string {
  return item.owner.kind === 'project' ? item.owner.id : item.owner.host
}

function scansOpen(item: Item): number | null {
  return item.delta?.kind === 'still'
    ? item.delta.scans_open
    : item.delta?.kind === 'new'
      ? 1
      : null
}

function severityRank(item: Item): number {
  return item.severity.level === 'crit' ? 0 : 1
}

/** `from` is the scan the other is read against; the rows say what `to` has that `from` has not. */
export function compareReports(from: Report, to: Report, filter: ProjectFilter): Compare {
  const open = (report: Report) =>
    new Map(
      report.items
        .filter((i) => inFilter(i, filter) && openLevel(i) !== null)
        .map((i) => [itemId(i), i] as const),
    )
  const before = open(from)
  const after = open(to)
  const answers = new Map(to.items.map((i) => [itemId(i), i] as const))

  const rows: CompareRow[] = []
  for (const [id, item] of after) {
    const kind: CompareKind = before.has(id) ? 'still' : 'new'
    rows.push({
      id,
      kind,
      item,
      owner: ownerOf(item),
      scans: kind === 'still' ? scansOpen(item) : null,
    })
  }
  for (const [id, item] of before) {
    const now = answers.get(id)
    const fixed =
      now && !after.has(id) && now.disposition.kind === 'active' && now.severity.level !== 'unknown'
    if (fixed) rows.push({ id, kind: 'fixed', item, owner: ownerOf(item), scans: null })
  }
  rows.sort(
    (a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      severityRank(a.item) - severityRank(b.item) ||
      a.item.key.check.localeCompare(b.item.key.check) ||
      a.id.localeCompare(b.id),
  )
  return {
    rows,
    new: rows.filter((r) => r.kind === 'new').length,
    fixed: rows.filter((r) => r.kind === 'fixed').length,
    still: rows.filter((r) => r.kind === 'still').length,
  }
}

export interface ScanFigures {
  hosts: HostsReached
  durationMs: number
}

/** The two figures the card puts under the rows for each scan. */
export function figuresOf(scan: ScanSummary, hosts: ReadonlySet<string> | null): ScanFigures {
  return { hosts: hostsReached(scan, hosts), durationMs: scanDurationMs(scan) }
}
