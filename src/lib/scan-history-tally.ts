// "Since #1": a plain tally over the reports of the kept scans, so neglect is visible. An
// issue is open when it is a warning or critical result that stands as it is. It is fixed when
// a scan finds it answering ok after a scan that found it open, and it is open for as many
// scans as it has been open in a row, up to the newest.
import type { Item, Report } from '@/api'
import { itemId, openLevel } from './server-issue'
import type { ProjectFilter } from './scan-history-chart'

export interface Tally {
  /** The first scan the tally starts from. */
  since: number
  fixed: number
  expected: number
  open: number
  /** Scans the longest-open issue has been open; `null` when nothing is open. */
  oldestOpen: number | null
}

/** Whether the item belongs to the project filter (everything when there is none). */
export function inFilter(item: Item, filter: ProjectFilter): boolean {
  return filter === null || (item.owner.kind === 'project' && item.owner.id === filter)
}

function openMap(report: Report, filter: ProjectFilter): Map<string, Item> {
  const map = new Map<string, Item>()
  for (const item of report.items) {
    if (inFilter(item, filter) && openLevel(item) !== null) map.set(itemId(item), item)
  }
  return map
}

function answersOk(item: Item): boolean {
  if (item.disposition.kind !== 'active') return false
  return item.severity.level === 'ok' || item.severity.level === 'info'
}

/** `reports` oldest first. */
export function tally(reports: readonly Report[], filter: ProjectFilter): Tally | null {
  const first = reports[0]
  const last = reports[reports.length - 1]
  if (!first || !last) return null

  let fixed = 0
  let before = openMap(first, filter)
  let streak = new Map([...before.keys()].map((id) => [id, 1]))
  for (const report of reports.slice(1)) {
    const now = openMap(report, filter)
    const byId = new Map(report.items.map((item) => [itemId(item), item]))
    for (const id of before.keys()) {
      const item = byId.get(id)
      if (!now.has(id) && item && answersOk(item)) fixed += 1
    }
    // Only an issue open in the scan before keeps counting; one that comes back starts again.
    streak = new Map([...now.keys()].map((id) => [id, (streak.get(id) ?? 0) + 1]))
    before = now
  }

  const open = openMap(last, filter)
  const expected = last.items.filter(
    (item) => inFilter(item, filter) && item.disposition.kind === 'expected',
  ).length
  const ages = [...open.keys()].map((id) => streak.get(id) ?? 1)
  return {
    since: first.seq ?? 1,
    fixed,
    expected,
    open: open.size,
    oldestOpen: ages.length > 0 ? Math.max(...ages) : null,
  }
}
