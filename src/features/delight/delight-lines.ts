// The warm status lines of a running scan. Each one is true for the check being run: the
// group a host is reading names the line, the host comes from the scan itself. Anything
// unknown, and any scan that already found something critical, gets a plain factual line.
import type { CheckGroup, ScanRun } from '@/api'
import { LOCAL_HOST, chipOf } from '@/lib/overview-scan'
import { stepsOf } from '@/features/scan-panel/scan-panel-model'

export const LINE_GROUPS = [
  'connect',
  'system',
  'disk',
  'containers',
  'databases',
  'security',
  'uptime',
  'code_changes',
] as const
export type LineGroup = (typeof LINE_GROUPS)[number]

export interface LineEntry {
  host: string
  group: LineGroup
}

export interface LinePick {
  key: string
  params: { host: string }
}

export const LINE_MS = 3000

/** What each host being read is doing right now; the URL checks have no host. */
export function lineEntries(run: ScanRun | null, off: readonly CheckGroup[]): LineEntry[] {
  return Object.entries(run?.hosts ?? {}).flatMap(([host, p]) => {
    if (!p || chipOf(p) !== 'reading' || p.state === 'agent_wait') return []
    if (host === LOCAL_HOST) return [{ host: '', group: 'uptime' as const }]
    const running = stepsOf(p, off).find((s) => s.state === 'running')
    // No compare step here (no last scan is passed), so the running step is a group or connect.
    const group = !running || running.id === 'compare' ? 'connect' : running.id
    return [{ host, group }]
  })
}

/** The line for tick `tick` (one per `LINE_MS`): hosts take turns, then the second wording. */
export function pickLine(entries: readonly LineEntry[], tick: number, critical: boolean): LinePick {
  const first = entries[0]
  if (entries.length === 0 || !first) {
    return { key: 'delight.lines.plainAll', params: { host: '' } }
  }
  const n = entries.length
  const at = Math.max(0, tick)
  const entry = entries[at % n] ?? first
  if (critical) {
    return entry.host
      ? { key: 'delight.lines.plain', params: { host: entry.host } }
      : { key: 'delight.lines.plainAll', params: { host: '' } }
  }
  const variant = Math.floor(at / n) % 2 === 0 ? 'a' : 'b'
  return { key: `delight.lines.byGroup.${entry.group}.${variant}`, params: { host: entry.host } }
}
