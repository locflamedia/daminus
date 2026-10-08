// The scan panel: one row per host, one segment per host, the steps of the host being read, and
// an estimate of what is left. The run carries which group a host finished last, so the steps
// are the groups in the order the scan reads them; nothing here is a measured time per step.
import type { CheckGroup, HistoryView, Project, ScanRun } from '@/api'
import { chipOf, scanHosts, type ChipState, type ScanHostView } from '@/lib/overview-scan'

/** The order the scan reads the groups of a host in. */
export const GROUP_ORDER: readonly CheckGroup[] = [
  'system',
  'disk',
  'containers',
  'databases',
  'security',
]

export type StepState = 'done' | 'running' | 'waiting'

export interface PanelStep {
  /** `connect` is the SSH connection; the rest are check groups. */
  id: 'connect' | CheckGroup
  state: StepState
  /** The step is waiting for the person's SSH agent. */
  agentWait: boolean
}

export type SegmentState = 'done' | 'reading' | 'failed' | 'waiting'

export interface PanelHost extends ScanHostView {
  /** The projects that use the host; empty when none does. */
  projects: string[]
  /** Set while the host is being read: its steps. */
  steps: PanelStep[]
  /** How far the host has got, 0 to 1; its steps are open only for the first host being read. */
  progress: number
  expanded: boolean
  segment: SegmentState
}

function segmentOf(chip: ChipState): SegmentState {
  return chip === 'queued' ? 'waiting' : chip
}

/**
 * The steps of a host being read: the connection, then each group the scan runs. `done` is
 * the group the host finished last; the group after it is the one running.
 */
export function stepsOf(
  progress: { state: string; step?: CheckGroup | null } | undefined,
  off: readonly CheckGroup[],
): PanelStep[] {
  const groups = GROUP_ORDER.filter((g) => !off.includes(g))
  const reading = progress?.state === 'running' || progress?.state === 'finished'
  const last = progress?.step ? groups.indexOf(progress.step) : -1
  const connect: PanelStep = {
    id: 'connect',
    state: reading ? 'done' : 'running',
    agentWait: progress?.state === 'agent_wait',
  }
  const rest = groups.map<PanelStep>((id, index) => ({
    id,
    agentWait: false,
    state: !reading
      ? 'waiting'
      : index <= last
        ? 'done'
        : index === last + 1
          ? 'running'
          : 'waiting',
  }))
  return [connect, ...rest]
}

/**
 * The panel's rows, in the order of the run. Two hosts run at a time, but only the first one
 * being read opens into its steps, so the list stays short.
 */
export function panelHosts(
  run: ScanRun | null,
  projects: readonly Project[],
  off: readonly CheckGroup[],
): PanelHost[] {
  const rows = scanHosts(run).map((h) => {
    const p = run?.hosts[h.host]
    const steps = p && chipOf(p) === 'reading' ? stepsOf(p, off) : []
    return {
      ...h,
      projects: projects
        .filter((project) => project.components.some((c) => c.host === h.host))
        .map((project) => project.name),
      steps,
      progress: progressOf(steps),
      expanded: false,
      segment: segmentOf(h.chip),
    }
  })
  const open = rows.findIndex((r) => r.steps.length > 0)
  return rows.map((r, i) => ({ ...r, expanded: i === open }))
}

/** "About 32 s left": how long the last saved scan took, less what has passed. */
export function estimateLeftMs(history: HistoryView | null, elapsedMs: number): number | null {
  const last = history?.scans[history.scans.length - 1]
  if (!last) return null
  const took = Date.parse(last.finished_at) - Date.parse(last.started_at)
  if (!Number.isFinite(took) || took <= 0) return null
  const left = took - elapsedMs
  return left > 0 ? left : null
}

/** The line of "Found so far": what each finished host read, worst outcome last. */
export function foundSoFar(hosts: readonly PanelHost[]): PanelHost[] {
  return hosts.filter((h) => h.chip === 'done' || h.chip === 'failed')
}

/** How far a host has got, 0 to 1: the connection and each group that is done, of all steps. */
export function progressOf(steps: readonly PanelStep[]): number {
  if (steps.length === 0) return 0
  return steps.filter((s) => s.state === 'done').length / steps.length
}

/** A running time as the panel writes it: `0:44`, `12:03`. */
export function clockText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const seconds = String(total % 60).padStart(2, '0')
  return `${Math.floor(total / 60)}:${seconds}`
}
