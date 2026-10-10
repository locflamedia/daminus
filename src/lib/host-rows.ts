// The rows of the pick-hosts table, as pure data: what each cell says, which rows a filter
// keeps, what the header chip and the footer count, and the commands the rail prints. The
// screen only draws these; the store keeps the ticks and the live test answers.
import type { HostEntry, HostOutcome, LoginReport, LoginResult, SkipReason } from '@/api'
import { type Locale } from '@/i18n'
import {
  type PermissionRow,
  type TestChip,
  isFailed,
  isReady,
  isRunning,
  keyName,
  isEndOfLife,
  latencyBars,
  shortDistro,
} from './host-test'

/** The connect timeout the login test uses unless the settings change it. */
export const CONNECT_TIMEOUT_S = 10

/** From this wall time on a reached host is called slow. */
export const SLOW_MS = 2000

export type RouteInfo = { kind: 'direct' } | { kind: 'jump'; via: string }

export type SystemInfo =
  { state: 'waiting' } | { state: 'unknown' } | { state: 'known'; name: string; eol: boolean }

export interface HostRowModel {
  alias: string
  /** The address ssh resolved, empty before the config could be resolved. */
  address: string
  user: string | null
  /** Only a port that is not 22. */
  port: number | null
  route: RouteInfo
  system: SystemInfo
  chip: TestChip
  ticked: boolean
  /** Wall time of the login test, once it ended. */
  ms: number | null
  key: string | null
  /** The identity files of the config, for the `ssh-add` line. */
  identityFiles: string[]
}

/** What the store knows about a host; the rows are built from it. */
export interface RowSources {
  isTicked: (alias: string) => boolean
  chip: (alias: string) => TestChip
  login: (alias: string) => LoginResult | null
  ms: (alias: string) => number | null
}

function systemOf(chip: TestChip, login: LoginResult | null): SystemInfo {
  if (isFailed(chip)) return { state: 'unknown' }
  const report = login?.login
  if (chip !== 'reached' || !report) return { state: 'waiting' }
  const raw = report.distro.trim() === '' ? report.os : report.distro
  return { state: 'known', name: shortDistro(raw), eol: isEndOfLife(raw) }
}

export function buildRows(entries: readonly HostEntry[], src: RowSources): HostRowModel[] {
  return entries.map((entry) => {
    const alias = entry.host.alias
    const resolved = entry.resolved
    const chip = src.chip(alias)
    const jump = resolved?.proxy_jump?.trim()
    return {
      alias,
      address: resolved?.hostname ?? '',
      user: resolved?.user ?? null,
      port: resolved && resolved.port !== 22 ? resolved.port : null,
      route: jump ? { kind: 'jump', via: jump } : { kind: 'direct' },
      system: systemOf(chip, src.login(alias)),
      chip,
      ticked: src.isTicked(alias),
      ms: isReady(chip) ? src.ms(alias) : null,
      key: keyName(resolved?.identity_files ?? []),
      identityFiles: resolved?.identity_files ?? [],
    }
  })
}

// --- filter and counts ---------------------------------------------------------------------

export type Segment = 'all' | 'ready' | 'failed'

export function filterRows(
  rows: readonly HostRowModel[],
  query: string,
  segment: Segment,
): HostRowModel[] {
  const needle = query.trim().toLowerCase()
  return rows.filter((r) => {
    if (segment === 'ready' && !isReady(r.chip)) return false
    if (segment === 'failed' && !isFailed(r.chip)) return false
    return needle === '' || r.alias.toLowerCase().includes(needle) || r.address.includes(needle)
  })
}

export function segmentCounts(rows: readonly HostRowModel[]): Record<Segment, number> {
  return {
    all: rows.length,
    ready: rows.filter((r) => isReady(r.chip)).length,
    failed: rows.filter((r) => isFailed(r.chip)).length,
  }
}

/** The box above the row ticks: empty, a dash for some, a tick for all. */
export type SelectState = 'none' | 'some' | 'all'

export function selectState(rows: readonly HostRowModel[]): SelectState {
  const n = rows.filter((r) => r.ticked).length
  return n === 0 ? 'none' : n === rows.length ? 'all' : 'some'
}

/** What the footer counts: the ticked hosts only. */
export interface TestCounts {
  ticked: number
  ready: number
  failed: number
  /** Queued or running. */
  testing: number
  /** Ended, with or without an answer. */
  tested: number
  /** Held: ssh refuses the config, so their tests have not run. */
  notChecked: number
}

export function testCounts(rows: readonly HostRowModel[]): TestCounts {
  const ticked = rows.filter((r) => r.ticked)
  const ready = ticked.filter((r) => isReady(r.chip)).length
  const failed = ticked.filter((r) => isFailed(r.chip)).length
  const testing = ticked.filter((r) => isRunning(r.chip) || r.chip === 'queued').length
  const notChecked = ticked.filter((r) => r.chip === 'not_checked').length
  return { ticked: ticked.length, ready, failed, testing, tested: ready + failed, notChecked }
}

/** How far the test is, for the bar: tested over ticked, never over what is listed. */
export function testProgress(counts: TestCounts): number {
  return counts.ticked === 0 ? 0 : counts.tested / counts.ticked
}

export type HeaderStatus =
  | { kind: 'idle' }
  | { kind: 'testing'; pending: number; total: number }
  | { kind: 'done'; total: number }

/** The chip at the top right: how many tests are still going, then that all ended. */
export function headerStatus(counts: TestCounts): HeaderStatus {
  // Nothing ran while ssh refuses the config: the banner says why, the chip says nothing.
  if (counts.ticked === 0 || (counts.notChecked > 0 && counts.testing === 0)) {
    return { kind: 'idle' }
  }
  if (counts.testing > 0) return { kind: 'testing', pending: counts.testing, total: counts.ticked }
  return { kind: 'done', total: counts.ticked }
}

// --- the latency signal --------------------------------------------------------------------

export interface Latency {
  bars: 2 | 3
  slow: boolean
}

/** The wall time the way the board writes it: seconds with two decimals (`0.38 s`). */
export function formatLatency(ms: number, locale: Locale): string {
  const n = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${n.format(ms / 1000)} s`
}

export function latencyOf(ms: number): Latency {
  return { bars: latencyBars(ms), slow: ms >= SLOW_MS }
}

// --- the failure card ----------------------------------------------------------------------

export type CardKind =
  'key_rejected' | 'unreachable' | 'timed_out' | 'host_key_unknown' | 'host_key_changed'

/** The failures that open an inline card; any other chip has none. */
export function cardKind(chip: TestChip): CardKind | null {
  return isFailed(chip) ? (chip as CardKind) : null
}

type NetCause = Extract<HostOutcome, { state: 'unreachable' }>['cause']

export type NetReason = 'dns' | 'refused' | 'no_route' | 'other'

export function netReason(cause: NetCause | null | undefined): NetReason {
  return cause === 'dns' || cause === 'refused' || cause === 'no_route' ? cause : 'other'
}

// --- the permission panel ------------------------------------------------------------------

/** The key of the sentence that words one permission row (`answer.docker.no_permission`). */
export function permissionKey(row: PermissionRow): string {
  return row.inGroup ? `answer.${row.kind}.${row.answer}_group` : `answer.${row.kind}.${row.answer}`
}

/** The groups the login script reports, the only ones it asks about. */
export function knownGroups(report: LoginReport): string[] {
  return [
    ...(report.docker_group ? ['docker'] : []),
    ...(report.adm_group ? ['adm'] : []),
    ...(report.journal_group ? ['systemd-journal'] : []),
  ]
}

/**
 * The groups line of a host: the user's own group, then the known ones. The report carries no
 * group names, only uid/user and three booleans, so the user's own group is taken to share the
 * user's name (the usual default). Empty when none of the known groups applies.
 */
export function groupNames(report: LoginReport): string[] {
  const known = knownGroups(report)
  return known.length === 0 ? [] : [report.user, ...known]
}

// --- left out ------------------------------------------------------------------------------

/** The message key of the word that says why an entry was left out. */
export function skipReasonKey(reason: SkipReason): string {
  switch (reason) {
    case 'wildcard':
      return 'wildcard'
    case 'match':
      return 'match'
    case 'no_host_name':
      return 'noHostName'
    case 'invalid_alias':
      return 'invalidAlias'
  }
}

// --- what the test runs --------------------------------------------------------------------

/** The `-o` options of the login test, in the order ssh gets them (see `SshTransport::args`). */
export const TEST_OPTIONS: readonly string[] = [
  'BatchMode=yes',
  'StrictHostKeyChecking=yes',
  `ConnectTimeout=${CONNECT_TIMEOUT_S}`,
]

/** What the login script runs on the server, one command per line (`discover/login.sh`). */
export const TEST_STEPS: readonly string[] = [
  'uname -s',
  'uname -r',
  'uname -m',
  'id -un',
  'id -u',
  'id -Gn',
  'awk … /etc/os-release',
  'docker version',
]
