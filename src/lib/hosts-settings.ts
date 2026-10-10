// Settings › Hosts as plain functions: the rows of the list (who uses a host, when it was last
// reached), the connect-time series and the explanation of an entry that is left out.
import type {
  HistoryView,
  HostEntry,
  HostOutcome,
  Project,
  ServerRollup,
  SkippedHost,
  SkipReason,
} from '@/api'
import { fingerprintParts } from '@/lib/host-key'
import { chipOfOutcome, type TestChip } from '@/lib/host-test'
import { SLOW_MS } from '@/lib/host-rows'
import type { Locale } from '@/i18n'
import { median } from '@/lib/project-series'

export type HostState = 'reached' | 'failed' | 'unknown'

export interface HostsRow {
  alias: string
  /** `user@address`, as the list prints it. */
  /** `user@hostname` as ssh resolves it; `null` while ssh gives no answer for the host. */
  target: string | null
  /** The jump host, when the connection goes through one. */
  via: string | null
  /** Names of the projects that have a part on this host. */
  projects: string[]
  state: HostState
  included: boolean
  /** When a scan last reached it; `null` when none did. */
  lastReached: string | null
  /** How the latest scan ended for it; `null` when no scan included it. */
  outcome: HostOutcome | null
}

function stateOf(outcome: HostOutcome | null | undefined): HostState {
  if (!outcome) return 'unknown'
  return outcome.state === 'reached' || outcome.state === 'partial' ? 'reached' : 'failed'
}

/** The chip of a host whose latest scan failed: its cause, as the login test would say it. */
export function failedChip(outcome: HostOutcome | null | undefined): TestChip {
  return outcome ? chipOfOutcome(outcome, null) : 'unreachable'
}

/** One row per listed host, in the order of the ssh config. */
export function hostsRows(
  entries: readonly HostEntry[],
  servers: readonly ServerRollup[],
  projects: readonly Project[],
  excluded: readonly string[],
): HostsRow[] {
  return entries.map((entry) => {
    const alias = entry.host.alias
    const server = servers.find((s) => s.host === alias)
    const resolved = entry.resolved
    const user = resolved?.user ? `${resolved.user}@` : ''
    const names = (server?.used_by ?? []).map((id) => projects.find((p) => p.id === id)?.name ?? id)
    return {
      alias,
      target: resolved ? `${user}${resolved.hostname}` : null,
      via: resolved?.proxy_jump ?? null,
      projects: names,
      state: stateOf(server?.outcome),
      included: !excluded.includes(alias),
      lastReached: server?.last_reached_at ?? null,
      outcome: server?.outcome ?? null,
    }
  })
}

export interface ConnectPoint {
  seq: number
  ms: number
  slow: boolean
}

/** The connect time of `host` in the newest `last` scans that timed it, oldest first. */
export function connectSeries(view: HistoryView | null, host: string, last = 12): ConnectPoint[] {
  const points = (view?.scans ?? []).flatMap((scan) => {
    const ms = scan.hosts[host]?.ms
    return ms === undefined || ms === null ? [] : [{ seq: scan.seq, ms, slow: ms >= SLOW_MS }]
  })
  return points.slice(-last)
}

export function connectMedian(points: readonly ConnectPoint[]): number | null {
  return median(points.map((p) => p.ms))
}

/** The slowest point of the series, when it is slow enough to say so. */
export function slowestPoint(points: readonly ConnectPoint[]): ConnectPoint | null {
  const worst = points.reduce<ConnectPoint | null>((a, p) => (!a || p.ms > a.ms ? p : a), null)
  return worst?.slow ? worst : null
}

/** Message key (`settingsHosts.leftOut.<key>`) of why an entry is not a host to scan. */
export function leftOutKey(reason: SkipReason): string {
  return reason === 'no_host_name'
    ? 'noHostName'
    : reason === 'invalid_alias'
      ? 'invalidAlias'
      : reason
}

/** An entry as the file has it: a wildcard or a Match block keeps its keyword. */
export function leftOutName(entry: SkippedHost): string {
  return entry.reason === 'match' ? `Match ${entry.pattern}` : entry.pattern
}

/** `file:line`, with the home folder as the file writes it. */
export function placeOf(file: string, line: number): string {
  return `${file}:${line}`
}

/** How many files besides the main one the entries come from (included files). */
export function includedFiles(
  entries: readonly HostEntry[],
  skipped: readonly SkippedHost[],
): number {
  const files = new Set([...entries.map((e) => e.host.file), ...skipped.map((s) => s.file)])
  files.delete('~/.ssh/config')
  return files.size
}

/** A connect or test time in seconds with one decimal: `0.4 s`. */
export function formatSeconds(ms: number, locale: Locale): string {
  const n = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return `${n.format(ms / 1000)} s`
}

/** `ED25519 SHA256:q3Vf…9kXw`: the algorithm and the ends of the digest. */
export function shortFingerprint(fp: string): string {
  const { algorithm, groups } = fingerprintParts(fp)
  const digest = groups.join('')
  const colon = digest.indexOf(':')
  const prefix = digest.slice(0, colon + 1)
  const body = digest.slice(colon + 1)
  const short = body.length > 10 ? `${body.slice(0, 4)}…${body.slice(-4)}` : body
  return `${algorithm ? `${algorithm} ` : ''}${prefix}${short}`
}
