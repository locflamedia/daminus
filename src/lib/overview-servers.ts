// The servers strip of the Overview: one cell per host with a disk ring, the load and the
// memory in use, read from the `disk.fs` and `sys.*` results of the latest report. A host that
// did not answer fades and offers a retry. Like the cards, it returns facts, not sentences.
import type { HostOutcome, Item, Level, Report, ServerRollup } from '@/api'
import { diskPercent, diskTone, isUnreachable, type DiskTone } from './rollups'

export type ServerCellState = 'ok' | 'unreachable' | 'not-scanned'

export interface ServerCell {
  host: string
  state: ServerCellState
  level: Level
  /** Fullest filesystem, in percent. */
  disk: number | null
  diskTone: DiskTone
  /** The 5-minute load average. */
  load: number | null
  /** Memory in use, in percent (the check reports what is available). */
  memUsed: number | null
  /** Whole days since the host last answered; `null` when it never did or it answers. */
  silentDays: number | null
  /** The results of this host were not checked in the latest scan. */
  stale: boolean
  /** How the latest scan ended for the host; `null` when it was not part of it. */
  outcome: HostOutcome | null
}

const DAY_MS = 86_400_000

function numberOf(items: readonly Item[], host: string, check: string): number | null {
  const value = items.find((i) => i.key.host === host && i.key.check === check)?.fact?.value
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function silentDays(server: ServerRollup, now: number): number | null {
  if (!isUnreachable(server.outcome) || !server.last_reached_at) return null
  const age = now - Date.parse(server.last_reached_at)
  return Number.isNaN(age) ? null : Math.max(0, Math.floor(age / DAY_MS))
}

/** One cell per server of the report, in the order of its rollups (already sorted). */
export function buildServerCells(report: Report, now: number): ServerCell[] {
  return report.servers.map((s) => {
    const free = numberOf(report.items, s.host, 'sys.mem')
    const disk = diskPercent(report.items, s.host)
    const mine = report.items.filter((i) => i.key.host === s.host)
    return {
      host: s.host,
      state: !s.included ? 'not-scanned' : isUnreachable(s.outcome) ? 'unreachable' : 'ok',
      level: s.level,
      disk,
      diskTone: disk === null ? 'normal' : diskTone(disk),
      load: numberOf(report.items, s.host, 'sys.load'),
      memUsed: free === null ? null : Math.round(100 - free),
      silentDays: silentDays(s, now),
      stale: mine.length > 0 && mine.every((i) => i.disposition.kind === 'stale'),
      outcome: s.outcome ?? null,
    }
  })
}

/**
 * Servers with a warning or worse of their own: a result no project owns (a disk shared by two
 * projects). A host whose trouble belongs to a project is counted on that project's card.
 */
export function serversNeedingLook(report: Report): string[] {
  const hosts = new Set<string>()
  for (const item of report.items) {
    const level = item.severity.level
    if (item.owner.kind !== 'server' || item.disposition.kind !== 'active') continue
    if (level === 'warn' || level === 'crit') hosts.add(item.owner.host)
  }
  return report.servers.map((s) => s.host).filter((h) => hosts.has(h))
}

/**
 * The summary chip of the servers: how many need a look and, when one is the whole story,
 * what its main issue is. `null` when no server needs a look.
 */
export interface ServerSummary {
  count: number
  check: string | null
  pct: number | null
}

export function serverChip(report: Report): ServerSummary | null {
  const hosts = serversNeedingLook(report)
  const first = hosts[0]
  if (!first) return null
  const own = report.items.filter(
    (i) =>
      i.owner.kind === 'server' &&
      i.owner.host === first &&
      i.disposition.kind === 'active' &&
      (i.severity.level === 'warn' || i.severity.level === 'crit'),
  )
  const check = hosts.length === 1 && own.length === 1 ? (own[0]?.key.check ?? null) : null
  return {
    count: hosts.length,
    check,
    pct: check === 'disk.fs' ? diskPercent(report.items, first) : null,
  }
}
