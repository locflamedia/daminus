// The read-only commands each group of checks runs on a host, as Settings › Scan lists them.
// Commands stay as they are typed on the server; the notes beside them are words and come from
// the messages. The list follows the switches: a group that is off adds no line.
import type { CheckGroup, HistoryView, HostSummary } from '@/api'
import type { ScanGroup } from '@/lib/scan-settings'

export type CommandLine =
  | { kind: 'comment'; key: string; note: string | null; group: 'system' | ScanGroup }
  | { kind: 'command'; key: string; text: string; note: string | null; group: 'system' | ScanGroup }

interface Template {
  group: 'system' | ScanGroup
  /** Message key of the note after the command (`settingsScan.runs.<note>`), when it has one. */
  lines: readonly ({ command: string; note?: string; warn?: boolean } | { comment: string })[]
}

const TEMPLATES: readonly Template[] = [
  { group: 'system', lines: [{ command: 'uname -a; cat /etc/os-release' }] },
  {
    group: 'disk',
    lines: [{ command: 'df -hP; du -xd3 /srv 2>/dev/null | sort -h | tail -20' }],
  },
  {
    group: 'containers',
    lines: [
      { command: 'docker ps -a --format json; docker inspect …' },
      { command: 'pm2 jlist', note: 'ifPm2' },
    ],
  },
  {
    group: 'security',
    lines: [
      { command: 'ss -tlnp; sshd -T 2>/dev/null | grep -E "passw|root"' },
      { command: 'find /srv/*/public -name "*.php" -newer …' },
    ],
  },
  {
    group: 'databases',
    lines: [{ comment: 'dbInside' }, { command: 'psql -At -c "select …"', note: 'sizesOnly' }],
  },
  {
    group: 'code_changes',
    lines: [{ command: 'git -C /srv/* status --porcelain', note: 'codeChanges', warn: true }],
  },
]

/** The lines to print for the groups that are on, in the order of the board. */
export function commandLines(disabled: readonly CheckGroup[]): CommandLine[] {
  const out: CommandLine[] = []
  for (const template of TEMPLATES) {
    if (template.group !== 'system' && disabled.includes(template.group)) continue
    template.lines.forEach((line, index) => {
      const key = `${template.group}:${index}`
      if ('comment' in line) {
        out.push({ kind: 'comment', key, note: line.comment, group: template.group })
      } else {
        out.push({
          kind: 'command',
          key,
          text: line.command,
          note: line.note ?? null,
          group: template.group,
        })
      }
    })
  }
  return out
}

/** The commands alone, one per line, as "Copy all" puts them on the clipboard. */
export function commandsText(lines: readonly CommandLine[]): string {
  return lines
    .filter((l): l is Extract<CommandLine, { kind: 'command' }> => l.kind === 'command')
    .map((l) => l.text)
    .join('\n')
}

export interface GroupTime {
  group: CheckGroup
  /** Mean over the hosts that finished the group, in seconds. */
  seconds: number
}

const TIMED: readonly CheckGroup[] = ['containers', 'security', 'disk', 'databases', 'uptime']

/** Where the time goes: the mean time of each group over the hosts of the newest scan. */
export function groupTimes(view: HistoryView | null): { seq: number; times: GroupTime[] } | null {
  const scan = view?.scans.at(-1)
  if (!scan) return null
  const hosts = Object.values(scan.hosts).filter((h): h is HostSummary => h !== undefined)
  const times: GroupTime[] = []
  for (const group of TIMED) {
    const values = hosts.map((h) => h.steps?.[group]).filter((v): v is number => v !== undefined)
    if (values.length === 0) continue
    times.push({ group, seconds: values.reduce((a, b) => a + b, 0) / values.length / 1000 })
  }
  times.sort((a, b) => b.seconds - a.seconds)
  return { seq: scan.seq, times }
}

/** About how long a scan of `hosts` takes: the slowest host of the newest scan, per round. */
export function estimateSeconds(
  view: HistoryView | null,
  hosts: number,
  atOnce: number | null,
): number | null {
  const scan = view?.scans.at(-1)
  const slowest = scan ? Math.max(0, ...Object.values(scan.hosts).map((h) => h?.ms ?? 0)) : 0
  if (slowest === 0 || hosts === 0) return null
  const together = Math.max(1, Math.min(atOnce ?? 8, hosts))
  return Math.round((slowest / 1000) * Math.ceil(hosts / together))
}
