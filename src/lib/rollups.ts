// Small pure helpers over the core's `Report`: what the sidebar and the cards sort and
// count by. The order rule (critical, warning, healthy, unreachable, then name) is applied
// only when a new report arrives, so it never changes while a scan is running.
import type { HostOutcome, Item, Level, ProjectRollup, ServerRollup } from '@/api'

interface HasCounts {
  counts: { crit: number; warn: number }
}

/** Open issues a badge shows: critical plus warnings. Expected and unknown never count. */
export function issueCount({ counts }: HasCounts): number {
  return counts.crit + counts.warn
}

/** Outcomes where the host did not answer (`partial` still answered). */
export function isUnreachable(outcome: HostOutcome | null | undefined): boolean {
  return outcome != null && outcome.state !== 'reached' && outcome.state !== 'partial'
}

function rank(level: Level, unreachable: boolean): number {
  if (level === 'crit') return 0
  if (level === 'warn') return 1
  return unreachable ? 3 : 2
}

function byRankThenName<T>(
  list: readonly T[],
  rankOf: (x: T) => number,
  nameOf: (x: T) => string,
): T[] {
  return [...list].sort((a, b) => rankOf(a) - rankOf(b) || nameOf(a).localeCompare(nameOf(b)))
}

export function sortProjects(projects: readonly ProjectRollup[]): ProjectRollup[] {
  return byRankThenName(
    projects,
    (p) => rank(p.level, p.unreachable_hosts.length > 0),
    (p) => p.id,
  )
}

export function sortServers(servers: readonly ServerRollup[]): ServerRollup[] {
  return byRankThenName(
    servers,
    (s) => rank(s.level, isUnreachable(s.outcome)),
    (s) => s.host,
  )
}

/** The fullest filesystem on a host, in percent; `null` when no `disk.fs` result has a number. */
export function diskPercent(items: readonly Item[], host: string): number | null {
  let worst: number | null = null
  for (const item of items) {
    if (item.key.host !== host || item.key.check !== 'disk.fs') continue
    const data = item.fact?.data
    if (typeof data !== 'object' || data === null || Array.isArray(data)) continue
    const pct = data.pct
    if (typeof pct === 'number' && Number.isFinite(pct) && (worst === null || pct > worst)) {
      worst = pct
    }
  }
  return worst
}

export type DiskTone = 'normal' | 'warn' | 'crit'

/** Rings are accent under 80 %, warning from 80, critical from 90 (the `disk.fs` thresholds). */
export function diskTone(pct: number): DiskTone {
  if (pct >= 90) return 'crit'
  if (pct >= 80) return 'warn'
  return 'normal'
}

export type ProjectTabId = 'disk' | 'database' | 'containers' | 'security'

const TAB_OF_GROUP: Partial<Record<Item['group'], ProjectTabId>> = {
  disk: 'disk',
  databases: 'database',
  containers: 'containers',
  security: 'security',
}

/**
 * The worst open issue per project tab, so a tab can carry a status dot when something
 * inside it needs a look. Only active warnings and critical results count.
 */
export function tabLevels(
  items: readonly Item[],
  projectId: string,
): Partial<Record<ProjectTabId, Level>> {
  const out: Partial<Record<ProjectTabId, Level>> = {}
  for (const item of items) {
    if (item.owner.kind !== 'project' || item.owner.id !== projectId) continue
    if (item.disposition.kind !== 'active') continue
    const tab = TAB_OF_GROUP[item.group]
    const level = item.severity.level
    if (!tab || (level !== 'warn' && level !== 'crit')) continue
    if (out[tab] !== 'crit') out[tab] = level
  }
  return out
}
