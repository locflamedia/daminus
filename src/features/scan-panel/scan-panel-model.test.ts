import { describe, expect, it } from 'vitest'
import type { HistoryView, Project, ScanRun } from '@/api'
import {
  clockText,
  estimateLeftMs,
  foundSoFar,
  panelHosts,
  progressOf,
  stepsOf,
} from './scan-panel-model'

const idle = { facts: 0, dropped: 0 }

describe('stepsOf', () => {
  it('starts with the connection running while the host connects', () => {
    const steps = stepsOf({ state: 'connecting' }, [])
    expect(steps.map((s) => [s.id, s.state])).toEqual([
      ['connect', 'running'],
      ['system', 'waiting'],
      ['disk', 'waiting'],
      ['containers', 'waiting'],
      ['databases', 'waiting'],
      ['security', 'waiting'],
    ])
  })

  it('marks the group after the last finished one as running', () => {
    const steps = stepsOf({ state: 'running', step: 'containers' }, [])
    expect(steps.map((s) => s.state)).toEqual([
      'done',
      'done',
      'done',
      'done',
      'running',
      'waiting',
    ])
  })

  it('opens with the first group running before any has finished', () => {
    expect(
      stepsOf({ state: 'running', step: null }, [])
        .map((s) => s.state)
        .slice(0, 3),
    ).toEqual(['done', 'running', 'waiting'])
  })

  it('leaves out groups switched off in Settings, and flags the agent wait', () => {
    const steps = stepsOf({ state: 'agent_wait' }, ['security', 'databases'])
    expect(steps.map((s) => s.id)).toEqual(['connect', 'system', 'disk', 'containers'])
    expect(steps[0]).toMatchObject({ state: 'running', agentWait: true })
  })
})

describe('panelHosts', () => {
  const projects: Project[] = [
    {
      id: 'a',
      name: 'tiemtra',
      urls: [],
      components: [{ role: 'be', host: 'vps-1', kind: 'path', path: '/x' }],
    },
  ]
  const run: ScanRun = {
    scan_id: 's',
    started_at: '2026-09-26T06:00:00Z',
    next_seq: 0,
    hosts: {
      '@local': { ...idle, state: 'finished', outcome: { state: 'reached' } },
      'vps-1': { ...idle, state: 'running', step: 'disk' },
      'vps-2': { ...idle, state: 'queued' },
      'vps-3': { ...idle, state: 'finished', outcome: { state: 'timeout' }, facts: 0 },
    },
  }

  it('gives one row per host with its projects, segment and, while read, its steps', () => {
    const rows = panelHosts(run, projects, [])
    expect(rows.map((r) => [r.host, r.segment, r.projects, r.expanded])).toEqual([
      ['vps-1', 'reading', ['tiemtra'], true],
      ['vps-2', 'waiting', [], false],
      ['vps-3', 'failed', [], false],
    ])
  })

  it('opens only the first host being read into its steps, though both have a progress', () => {
    const two: ScanRun = {
      ...run,
      hosts: {
        a: { ...idle, state: 'running', step: 'system' },
        b: { ...idle, state: 'running', step: 'disk' },
      },
    }
    const rows = panelHosts(two, [], [])
    expect(rows.map((r) => r.expanded)).toEqual([true, false])
    expect(rows.map((r) => r.progress)).toEqual([2 / 6, 3 / 6])
  })

  it('lists the hosts that finished or are being read, not those still waiting', () => {
    expect(foundSoFar(panelHosts(run, projects, [])).map((h) => h.host)).toEqual(['vps-1', 'vps-3'])
  })

  it('ends the steps of a host with the comparison with the last saved scan', () => {
    const steps = stepsOf({ state: 'running', step: 'security' }, [], 12)
    expect(steps.at(-1)).toEqual({ id: 'compare', state: 'running', agentWait: false })
    expect(stepsOf({ state: 'running', step: 'disk' }, [], 12).at(-1)?.state).toBe('waiting')
    expect(stepsOf({ state: 'running', step: 'disk' }, []).some((s) => s.id === 'compare')).toBe(
      false,
    )
  })
})

describe('estimateLeftMs', () => {
  const history = (ms: number): HistoryView =>
    ({
      scans: [
        {
          seq: 1,
          started_at: '2026-09-26T06:00:00Z',
          finished_at: new Date(Date.parse('2026-09-26T06:00:00Z') + ms).toISOString(),
        },
      ],
      bytes: 0n,
    }) as unknown as HistoryView

  it('is what the last saved scan took, less what has passed', () => {
    expect(estimateLeftMs(history(15_000), 5_000)).toBe(10_000)
  })

  it('says nothing once the last scan time is exceeded or without history', () => {
    expect(estimateLeftMs(history(15_000), 16_000)).toBeNull()
    expect(estimateLeftMs(null, 0)).toBeNull()
    expect(estimateLeftMs({ scans: [], bytes: 0n } as unknown as HistoryView, 0)).toBeNull()
  })
})

describe('progressOf', () => {
  it('is the share of steps done, and 0 with no steps', () => {
    expect(progressOf([])).toBe(0)
    expect(progressOf(stepsOf({ state: 'running', step: 'disk' }, []))).toBeCloseTo(0.5)
  })
})

describe('clockText', () => {
  it('writes minutes and two-digit seconds', () => {
    expect(clockText(44_000)).toBe('0:44')
    expect(clockText(723_000)).toBe('12:03')
    expect(clockText(-5)).toBe('0:00')
  })
})
