// Turns the latest report (and the ssh config's hosts) into what the intro draws.
//
// Choices the design board leaves open:
// - Issue counts are the report's own `counts` (open critical and warning results, each result
//   once, expected and unknown left out), the same numbers the sidebar badges add up.
// - `disk` is how many of those open critical or warning results belong to the disk group.
// - One dune and one star per server of the report, in the report's order (already sorted
//   worst first); the painting draws the first five.
// - A dune's height is the host's fullest filesystem (`diskPercent`), `null` without a reading.
// - A dune or star is `offline` when the host did not answer in the latest scan, otherwise its
//   level is the host's worst severity: critical, warning, or ok (info counts as ok).
// - A star's label is "disk 87%" when the host's main issue is a disk check with a reading,
//   else "2 critical", else "1 warning" / "3 warnings", else empty (healthy or offline).
// - On a first launch nothing has been scanned: the stars are the host aliases of the ssh
//   config, as given.
import type { Report, ServerRollup } from '@/api'
import { diskPercent, isUnreachable } from '@/lib/rollups'
import type { IntroScene, Level } from './scene'

function levelOf(server: ServerRollup): Level {
  if (isUnreachable(server.outcome)) return 'offline'
  if (server.level === 'crit' || server.level === 'warn') return server.level
  return 'ok'
}

function labelOf(server: ServerRollup, level: Level, pct: number | null): string {
  if (level === 'offline') return ''
  const { crit, warn } = server.counts
  if (crit + warn === 0) return ''
  if (server.main_issue?.key.check.startsWith('disk.') && pct !== null) {
    return `disk ${Math.round(pct)}%`
  }
  if (crit > 0) return `${crit} critical`
  return warn === 1 ? '1 warning' : `${warn} warnings`
}

function diskIssues(report: Report): number {
  return report.items.filter(
    (i) =>
      i.group === 'disk' &&
      i.disposition.kind === 'active' &&
      (i.severity.level === 'warn' || i.severity.level === 'crit'),
  ).length
}

/** The scene for a report; `null` (no report yet) gives an empty one. */
export function sceneFromReport(report: Report | null, hosts: readonly string[]): IntroScene {
  if (report === null) {
    return { hosts: [...hosts], issues: { crit: 0, warn: 0, disk: 0 }, dunes: [], stars: [] }
  }
  const rows = report.servers.map((server) => {
    const level = levelOf(server)
    const pct = level === 'offline' ? null : diskPercent(report.items, server.host)
    return { server, level, pct }
  })
  return {
    hosts: [...hosts],
    issues: { crit: report.counts.crit, warn: report.counts.warn, disk: diskIssues(report) },
    dunes: rows.map(({ server, level, pct }) => ({
      name: server.host,
      pct: pct === null ? null : Math.round(pct),
      level,
    })),
    stars: rows.map(({ server, level, pct }) => ({
      name: server.host,
      label: labelOf(server, level, pct),
      level,
    })),
  }
}
