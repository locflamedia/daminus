// What a running scan means for the Overview: one state word per host, which cards are still
// waiting for their hosts, which of their tiles are being read, and how far the scan has got.
// The numbers on the cards stay those of the last saved scan until the new one is saved, so
// this only says what is being read, never what was found.
import type { HostOutcome, HostProgress, Project, ScanRun } from '@/api'

/** The URL checks run from this Mac under this pseudo host. */
export const LOCAL_HOST = '@local'

export type ChipState = 'queued' | 'reading' | 'done' | 'failed'

export interface ScanHostView {
  host: string
  chip: ChipState
  /** The SSH agent is waiting for the person to approve. */
  agentWait: boolean
  /** The state word's cause for the tooltip: the progress state, or the outcome of a finished host. */
  detail: string
  outcome: HostOutcome | null
  facts: number
}

function isFinished(p: HostProgress): p is Extract<HostProgress, { state: 'finished' }> {
  return p.state === 'finished'
}

export function chipOf(p: HostProgress): ChipState {
  if (p.state === 'queued') return 'queued'
  if (isFinished(p)) {
    return p.outcome.state === 'reached' || p.outcome.state === 'partial' ? 'done' : 'failed'
  }
  return 'reading'
}

/** The hosts of the run in the order the core lists them, without the URL checks. */
export function scanHosts(run: ScanRun | null): ScanHostView[] {
  return Object.entries(run?.hosts ?? {}).flatMap(([host, p]) =>
    p && host !== LOCAL_HOST
      ? [
          {
            host,
            chip: chipOf(p),
            agentWait: p.state === 'agent_wait',
            detail: isFinished(p) ? p.outcome.state : p.state,
            outcome: isFinished(p) ? p.outcome : null,
            facts: p.facts,
          },
        ]
      : [],
  )
}

/** The URL checks of this scan: `null` when the scan does not run them (a host retry). */
export function urlChecks(run: ScanRun | null): ChipState | null {
  const p = run?.hosts[LOCAL_HOST]
  return p ? chipOf(p) : null
}

export interface ScanCounts {
  total: number
  done: number
  failed: number
  /** Hosts finished, whatever the outcome. */
  finished: number
}

export function scanCounts(run: ScanRun | null): ScanCounts {
  const hosts = scanHosts(run)
  const done = hosts.filter((h) => h.chip === 'done').length
  const failed = hosts.filter((h) => h.chip === 'failed').length
  return { total: hosts.length, done, failed, finished: done + failed }
}

export type CardPhase = 'idle' | 'waiting' | 'updating'

export interface CardScan {
  phase: CardPhase
  /** The host of the project being read now (or the first one still waiting for a slot). */
  reading: string | null
  /** The host is only queued: the line says "waiting for", not "reading". */
  queuedOnly: boolean
  /** Tiles whose result is being read. */
  uptime: boolean
  disk: boolean
  db: boolean
}

const IDLE: CardScan = {
  phase: 'idle',
  reading: null,
  queuedOnly: false,
  uptime: false,
  disk: false,
  db: false,
}

function pending(run: ScanRun, host: string): boolean {
  const p = run.hosts[host]
  return p !== undefined && !isFinished(p)
}

/**
 * How a card stands in the running scan. It is "waiting" until one of its hosts has finished,
 * "updating" after that, and not part of the scan when none of its hosts is in the run.
 */
export function cardScan(project: Project, run: ScanRun | null): CardScan {
  if (!run) return IDLE
  const hosts = [...new Set(project.components.map((c) => c.host))].filter((h) => run.hosts[h])
  const local = run.hosts[LOCAL_HOST]
  if (hosts.length === 0 && !local) return IDLE
  const finished = hosts.filter((h) => !pending(run, h)).length
  const open = hosts.filter((h) => pending(run, h))
  const busy = open.find((h) => run.hosts[h]?.state !== 'queued') ?? null
  const dbHosts = project.components.filter((c) => c.kind === 'db').map((c) => c.host)
  return {
    phase: finished === 0 ? 'waiting' : 'updating',
    reading: busy ?? open[0] ?? null,
    queuedOnly: busy === null && open.length > 0,
    uptime: local !== undefined && !isFinished(local),
    disk: open.length > 0,
    db: dbHosts.some((h) => pending(run, h)),
  }
}

export type ServerScan = 'queued' | 'reading' | 'done' | 'failed' | null

/** The state of a host in the running scan; `null` when the scan does not include it. */
export function serverScan(host: string, run: ScanRun | null): ServerScan {
  const p = run?.hosts[host]
  return p ? chipOf(p) : null
}
