// The strip of five check groups by scans. A cell is the worst level any check of the group
// reached for the project in that scan, read from the scan's own summary; a group that did not
// run (the security group before it was switched on, a host that did not answer) is "not run".
import type { Level, ScanSummary } from '@/api'
import type { IconName } from '@/ui/icon-paths'

export type StripState = 'ok' | 'warn' | 'crit' | 'none'

export interface StripGroup {
  id: 'uptime' | 'response' | 'disk' | 'containers' | 'security'
  icon: IconName
  /** The checks whose level counts for the group. */
  checks: readonly string[]
  /** Levels of these checks that count; others read as fine ("down" is a critical `url.http`). */
  only?: Partial<Record<string, readonly Level[]>>
}

export const STRIP_GROUPS: readonly StripGroup[] = [
  {
    id: 'uptime',
    icon: 'uptime',
    checks: ['url.http', 'url.tls'],
    only: { 'url.http': ['crit'] },
  },
  { id: 'response', icon: 'pulse', checks: ['url.http'] },
  { id: 'disk', icon: 'database', checks: ['disk.fs', 'disk.path', 'logs.big'] },
  { id: 'containers', icon: 'container', checks: ['docker.compose', 'docker.df', 'pm2.app'] },
  {
    id: 'security',
    icon: 'shield',
    checks: [
      'sec.miner',
      'sec.preload',
      'sec.tmp_exec',
      'sec.upload_php',
      'sec.ports',
      'sec.recent_change',
      'url.exposed',
    ],
  },
]

const RANK: Record<Level, number> = { ok: 0, info: 0, warn: 1, crit: 2 }

/** The cell of `group` in `scan` for the project. */
export function stripCell(scan: ScanSummary, projectId: string, group: StripGroup): StripState {
  const checks = scan.projects.find((p) => p.id === projectId)?.checks
  if (!checks) return 'none'
  let worst: Level | null = null
  for (const id of group.checks) {
    const level = checks[id]
    if (level === undefined) continue
    const counts = group.only?.[id]
    const read: Level = counts && !counts.includes(level) ? 'ok' : level
    if (worst === null || RANK[read] > RANK[worst]) worst = read
  }
  if (worst === null) return 'none'
  return worst === 'crit' ? 'crit' : worst === 'warn' ? 'warn' : 'ok'
}

export interface StripRow {
  id: StripGroup['id']
  icon: IconName
  cells: StripState[]
}

export function stripRows(scans: readonly ScanSummary[], projectId: string): StripRow[] {
  return STRIP_GROUPS.map((g) => ({
    id: g.id,
    icon: g.icon,
    cells: scans.map((s) => stripCell(s, projectId, g)),
  }))
}

/**
 * The worst group that was not fine in `scan` apart from `own` (the groups the curve itself is
 * about), so a spike can point at what else turned in the same scan; `null` when nothing did.
 */
export function sameScanTrouble(
  scan: ScanSummary,
  projectId: string,
  own: readonly StripGroup['id'][],
): { group: StripGroup['id']; state: 'warn' | 'crit' } | null {
  let found: { group: StripGroup['id']; state: 'warn' | 'crit' } | null = null
  for (const g of STRIP_GROUPS) {
    if (own.includes(g.id)) continue
    const state = stripCell(scan, projectId, g)
    if (state !== 'warn' && state !== 'crit') continue
    if (found === null || (state === 'crit' && found.state === 'warn'))
      found = { group: g.id, state }
  }
  return found
}
