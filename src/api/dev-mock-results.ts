// Development only: answers the result commands from the committed timeline (see
// `testing/results-bundle.ts`) so every result screen can be seen and used in a plain browser,
// and plays a scripted scan with timers in place of servers. The production bundle never
// imports it.
import { applyEvent } from '@/stores/scan'
import { bundleAsOf, type ResultsBundle } from '@/testing/results-bundle'
import { withSecurity } from '@/testing/results-security'
import { withStates } from '@/testing/results-states'
import { TAB_CASES, isTabCase, withTabCase } from '@/testing/results-tab-states'
import { shellScanRun } from '@/testing/shell-fixture'
import type {
  CheckGroup,
  HistoryView,
  HostOutcome,
  HostSummary,
  Report,
  ScanEvent,
  ScanEventBody,
  ScanRun,
  ScanStarted,
} from './index'
import { emitScanEvent } from './testing'

const DAY = 86_400_000

export const RESULTS_VARIANTS = [
  'results',
  'stale',
  'scanning',
  'scan-live',
  'scan-failing',
  'loading',
  'error',
  'first-scan',
  'groups-off',
  'states',
  'real',
  'security',
  ...TAB_CASES.map((c) => `tab-${c}` as const),
] as const

/**
 * `results` (the default) is the Monday screen, scan 12 finished two minutes ago. `stale` is
 * the same window opened four days after scan 9. `scanning` freezes the midpoint of a scan,
 * `scan-live` plays one when Scan is pressed (`&speed=4` runs it faster) and `scan-failing`
 * plays one where a host times out. `loading` never answers, `error` fails every read,
 * `first-scan` has projects and no scan, `groups-off` switches the security group off in
 * Settings, `real` serves scans made against a fake server (see below) and `states` adds the rarer results (certificate states, partial miner check, a
 * database that cannot be read, a cut findings list).
 */
export type ResultsVariant = (typeof RESULTS_VARIANTS)[number]

export function isResultsVariant(variant: string): variant is ResultsVariant {
  return (RESULTS_VARIANTS as readonly string[]).includes(variant)
}

/** `?mock=security&sec=<scenario>`: which Security tab state `results-security.ts` draws. */
function securityScenario(): string | null {
  return typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('sec')
}

const GROUP_ORDER: CheckGroup[] = ['system', 'disk', 'containers', 'databases', 'security']

export class ResultsMock {
  private data: ReturnType<typeof bundleAsOf>
  private run: ScanRun | null = null
  private seq = 0
  private n = 0
  private timers: ReturnType<typeof setTimeout>[] = []

  constructor(
    private variant: ResultsVariant,
    bundle: ResultsBundle,
    private speed = 1,
  ) {
    const stale = variant === 'stale'
    const newest = bundle.history.scans[bundle.history.scans.length - 1]
    const real = variant === 'real' && newest !== undefined
    const upTo = real ? newest.seq : stale ? 9 : variant === 'scanning' ? 11 : 12
    const ago = real
      ? Math.max(0, Date.now() - Date.parse(newest.finished_at))
      : stale
        ? 4 * DAY + 3_600_000
        : variant === 'scanning'
          ? 20 * 60_000
          : 2 * 60_000
    this.data = bundleAsOf(bundle, upTo, ago)
    if (variant === 'groups-off') this.data = withGroupsOff(this.data)
    if (variant === 'states') this.data = withStates(this.data)
    if (variant.startsWith('tab-') && isTabCase(variant.slice(4))) {
      this.data = withTabCase(this.data, variant.slice(4) as never)
    }
    if (variant === 'security') this.data = withSecurity(this.data, securityScenario())
    if (variant === 'scanning') this.run = midScan(this.hosts())
  }

  private hosts(): string[] {
    const report = this.data.reports[String(this.data.latest)]
    return report?.servers.filter((s) => s.included).map((s) => s.host) ?? []
  }

  handle = (cmd: string, args: Record<string, unknown>): unknown => {
    const v = this.variant
    if (v === 'loading' && READS.includes(cmd)) return new Promise(() => undefined)
    if (v === 'error' && READS.includes(cmd)) return Promise.reject(IO_ERROR)
    switch (cmd) {
      case 'report_latest':
        return v === 'first-scan' ? this.firstScan() : this.report(this.data.latest)
      case 'report_at': {
        const report = this.data.reports[String(args.seq)]
        return report ?? Promise.reject(IO_ERROR)
      }
      case 'history_list':
        return v === 'first-scan'
          ? { scans: [], keep: 20, bytes: 0 }
          : { ...withSteps(this.data.history), bytes: 184_000 }
      case 'history_facts': {
        const checks = args.checks as string[]
        const last = Number(args.last)
        const from = this.data.latest - last + 1
        return this.data.facts.filter((f) => checks.includes(f.fact.check) && f.seq >= from)
      }
      case 'rules_list':
        return this.data.rules
      case 'projects_list':
        return this.data.projects
      case 'scan_status':
        return this.run && structuredClone(this.run)
      case 'scan_start':
        return this.start(args.scope as { hosts?: string[] } | null)
      case 'scan_stop':
        return this.stop()
      default:
        return undefined
    }
  }

  private report(seq: number): Report | Promise<Report> {
    return this.data.reports[String(seq)] ?? Promise.reject(IO_ERROR)
  }

  private firstScan(): Report {
    const base = this.data.reports[String(this.data.latest)]
    if (!base) return emptyReport()
    return {
      ...base,
      seq: null,
      scanned_at: null,
      items: [],
      counts: { crit: 0, warn: 0, expected: 0, needs_perm: 0, stale: 0, unknown: 0 },
      projects: base.projects.map((p) => ({
        ...p,
        level: 'ok',
        counts: { crit: 0, warn: 0, expected: 0, needs_perm: 0, stale: 0, unknown: 0 },
        main_issue: null,
        unreachable_hosts: [],
        not_scanned_hosts: [],
      })),
      servers: base.servers.map((s) => ({
        ...s,
        outcome: null,
        last_reached_seq: null,
        last_reached_at: null,
        level: 'ok',
        counts: { crit: 0, warn: 0, expected: 0, needs_perm: 0, stale: 0, unknown: 0 },
        main_issue: null,
      })),
    }
  }

  private start(scope: { hosts?: string[] } | null): ScanStarted {
    if (this.run) return { scan_id: this.run.scan_id, joined: true }
    const id = `mock-${++this.n}`
    const only = scope?.hosts && scope.hosts.length > 0 ? scope.hosts : this.hosts()
    const names = ['@local', ...only.filter((h) => h !== '@local')]
    this.run = {
      scan_id: id,
      started_at: new Date().toISOString(),
      next_seq: 0,
      hosts: Object.fromEntries(names.map((h) => [h, { state: 'queued', facts: 0, dropped: 0 }])),
    } as ScanRun
    this.seq = 0
    this.play(id, names)
    return { scan_id: id, joined: false }
  }

  private stop(): boolean {
    if (!this.run) return false
    const id = this.run.scan_id
    this.clear()
    this.run = null
    this.emit(id, { kind: 'cancelled' })
    return true
  }

  private clear() {
    this.timers.forEach(clearTimeout)
    this.timers = []
  }

  private at(ms: number, fn: () => void) {
    this.timers.push(setTimeout(fn, ms / this.speed))
  }

  private emit(scanId: string, body: ScanEventBody) {
    const event = { scan_id: scanId, seq: this.seq++, ...body } as ScanEvent
    void emitScanEvent(event)
  }

  /** Two hosts at a time, as the default does; every host runs its groups in turn. */
  private play(id: string, names: string[]) {
    const failing = this.variant === 'scan-failing'
    const slots = 2
    const lanes: string[][] = Array.from({ length: slots }, () => [])
    names.forEach((h, i) => lanes[i % slots]?.push(h))
    let end = 0
    for (const lane of lanes) {
      let t = 300
      for (const host of lane) {
        const fails = failing && host === names[names.length - 1] && host !== '@local'
        t = this.playHost(id, host, t, fails)
      }
      end = Math.max(end, t)
    }
    this.at(end + 400, () => {
      if (this.run?.scan_id !== id) return
      this.run = null
      this.emit(id, { kind: 'done', snapshot_seq: this.data.latest })
    })
  }

  private playHost(id: string, host: string, from: number, fails: boolean): number {
    let t = from
    const apply = (body: ScanEventBody) => {
      if (this.run?.scan_id !== id) return
      const event = { scan_id: id, seq: this.seq, ...body } as ScanEvent
      applyEvent(this.run, event)
      this.seq++
      void emitScanEvent(event)
    }
    this.at(t, () => apply({ kind: 'host_started', host }))
    t += 500
    if (fails) {
      t += 1500
      const outcome: HostOutcome = { state: 'timeout' }
      this.at(t, () =>
        apply({ kind: 'host_finished', host, outcome, ms: 10_000, facts: 0, dropped: 0 }),
      )
      return t + 100
    }
    this.at(t, () => apply({ kind: 'host_running', host }))
    const groups = host === '@local' ? (['uptime', 'security'] as CheckGroup[]) : GROUP_ORDER
    let facts = 0
    for (const group of groups) {
      t += 700
      facts += 3
      const n = facts
      this.at(t, () => {
        for (let i = 0; i < 3; i++) {
          apply({
            kind: 'fact',
            host,
            fact: { check: `${group}.mock`, target: String(n - i), value: i },
          })
        }
        apply({ kind: 'step', host, group, ms: 700 })
      })
    }
    t += 300
    this.at(t, () =>
      apply({
        kind: 'host_finished',
        host,
        outcome: { state: 'reached' },
        ms: t,
        facts,
        dropped: 0,
      }),
    )
    return t + 100
  }
}

const READS = ['report_latest', 'report_at', 'history_list', 'history_facts', 'rules_list']
const IO_ERROR = {
  code: { kind: 'config_invalid', path: 'settings.json', line: 4 },
  params: {},
  retryable: false,
}

function emptyReport(): Report {
  const now = new Date().toISOString()
  return {
    evaluated_at: now,
    items: [],
    projects: [],
    servers: [],
    disabled_groups: [],
    rules_due: [],
    counts: { crit: 0, warn: 0, expected: 0, needs_perm: 0, stale: 0, unknown: 0 },
  }
}

/** Settings › Scan with the security group off: its results are not evaluated at all. */
function withGroupsOff(data: ReturnType<typeof bundleAsOf>): ReturnType<typeof bundleAsOf> {
  const reports = Object.fromEntries(
    Object.entries(data.reports).map(([seq, r]) => [
      seq,
      { ...r, disabled_groups: ['security'], items: r.items.filter((i) => i.group !== 'security') },
    ]),
  ) as Record<string, Report>
  return { ...data, reports }
}

/** The midpoint of a scan, over the hosts of the timeline. */
function midScan(hosts: string[]): ScanRun {
  const run = shellScanRun()
  const idle = { facts: 0, dropped: 0 }
  const done = {
    ...idle,
    facts: 14,
    state: 'finished' as const,
    outcome: { state: 'reached' as const },
  }
  const states = [
    done,
    done,
    { ...idle, state: 'running' as const },
    { ...idle, state: 'running' as const },
  ]
  return {
    ...run,
    hosts: {
      '@local': done,
      ...Object.fromEntries(
        hosts.map((h, i) => [h, states[i] ?? { ...idle, state: 'queued' as const }]),
      ),
    },
  } as ScanRun
}

/** The share of a host's time each group took, as the last scans of the board measured it. */
const STEP_SHARE = { containers: 0.88, security: 0.79, disk: 0.5, databases: 0.33, uptime: 0.25 }

/** The saved scans carry no per-group times: give each reached host the board's. */
function withSteps(history: HistoryView): HistoryView {
  const timed = (summary: HostSummary, seq: number): HostSummary => {
    const reached = summary.outcome.state === 'reached'
    const ms = summary.ms ?? (reached ? (seq === 7 ? 2600 : 380 + ((seq * 53) % 160)) : 0)
    if (ms === 0) return summary
    const steps = Object.fromEntries(
      Object.entries(STEP_SHARE).map(([group, share]) => [group, Math.round(ms * share)]),
    )
    return { ...summary, ms, steps }
  }
  const scans = history.scans.map((scan) => ({
    ...scan,
    hosts: Object.fromEntries(
      Object.entries(scan.hosts).flatMap(([host, summary]) =>
        summary ? [[host, timed(summary, scan.seq)]] : [],
      ),
    ),
  }))
  return { ...history, scans }
}
