import { describe, expect, it } from 'vitest'
import type { HistoryView, ScanSummary } from '@/api'
import { counts } from '@/testing/report-fixture'
import {
  hostsReached,
  hostsShort,
  issueCounts,
  projectIds,
  scanRows,
  SHOWN_SCANS,
  shownScans,
  unreachableRuns,
} from './scan-history-chart'

function scan(seq: number, over: Partial<ScanSummary> = {}): ScanSummary {
  return {
    seq,
    started_at: `2026-09-${10 + seq}T06:40:00Z`,
    finished_at: `2026-09-${10 + seq}T06:41:02Z`,
    hosts: {
      '@local': { outcome: { state: 'reached' } },
      a: { outcome: { state: 'reached' } },
      b: { outcome: { state: 'unreachable', cause: 'refused' } },
    },
    counts: counts({ crit: 2, warn: 4 }),
    info: 1,
    projects: [
      { id: 'p1', crit: 2, warn: 1, info: 0, checks: {} },
      { id: 'p2', crit: 0, warn: 3, info: 1, checks: {} },
    ],
    ...over,
  }
}

describe('issueCounts', () => {
  it('uses the scan totals, or the numbers of one project when filtered', () => {
    expect(issueCounts(scan(1), null)).toEqual({ crit: 2, warn: 4, info: 1 })
    expect(issueCounts(scan(1), 'p2')).toEqual({ crit: 0, warn: 3, info: 1 })
  })

  it('counts a project the scan did not know as no issues', () => {
    expect(issueCounts(scan(1), 'gone')).toEqual({ crit: 0, warn: 0, info: 0 })
  })
})

describe('projectIds', () => {
  it('lists the projects as the newest scan has them, then ones only older scans had', () => {
    const view = {
      scans: [
        scan(1, { projects: [{ id: 'old', crit: 0, warn: 0, info: 0, checks: {} }] }),
        scan(2),
      ],
      keep: 20,
      bytes: 0n,
    } satisfies HistoryView
    expect(projectIds(view)).toEqual(['p1', 'p2', 'old'])
    expect(projectIds(null)).toEqual([])
  })
})

describe('hostsReached', () => {
  it('counts the servers that answered out of those asked, leaving the URL checks out', () => {
    expect(hostsReached(scan(1), null)).toEqual({ reached: 1, total: 2 })
    expect(hostsShort({ reached: 1, total: 2 })).toBe(true)
    expect(hostsShort({ reached: 2, total: 2 })).toBe(false)
  })

  it('narrows to the hosts of a project', () => {
    expect(hostsReached(scan(1), new Set(['a']))).toEqual({ reached: 1, total: 1 })
  })

  it('counts a partial answer as reached', () => {
    const partial = scan(1, { hosts: { a: { outcome: { state: 'partial' } } } })
    expect(hostsReached(partial, null)).toEqual({ reached: 1, total: 1 })
  })
})

describe('scanRows', () => {
  it('lists the newest scan first with its duration and counts', () => {
    const rows = scanRows([scan(1), scan(2)], null, null)
    expect(rows.map((r) => r.seq)).toEqual([2, 1])
    expect(rows[0]).toMatchObject({ durationMs: 62_000, crit: 2, warn: 4, info: 1 })
  })

  it('narrows the counts and the hosts to a project', () => {
    const rows = scanRows([scan(1)], 'p1', new Set(['b']))
    expect(rows[0]).toMatchObject({ crit: 2, warn: 1, info: 0, hosts: { reached: 0, total: 1 } })
  })
})

describe('shownScans', () => {
  it('shows the newest scans and says how many are kept', () => {
    const scans = Array.from({ length: SHOWN_SCANS + 5 }, (_, i) => scan(i + 1))
    const shown = shownScans({ scans, keep: null, bytes: 0n })
    expect(shown.scans).toHaveLength(SHOWN_SCANS)
    expect(shown.scans[0]?.seq).toBe(6)
    expect(shown.total).toBe(SHOWN_SCANS + 5)
    expect(shownScans(null)).toEqual({ scans: [], total: 0 })
  })
})

describe('unreachableRuns', () => {
  const down = { outcome: { state: 'unreachable', cause: 'refused' } } as const
  const up = { outcome: { state: 'reached' } } as const

  it('names the hosts that did not answer the newest scan and since which scan', () => {
    const scans = [
      scan(1, { hosts: { a: up, b: up } }),
      scan(2, { hosts: { a: up, b: down } }),
      scan(3, { hosts: { a: up, b: down } }),
    ]
    expect(unreachableRuns(scans)).toEqual([{ host: 'b', since: 2, scans: 2 }])
  })

  it('does not look past a scan that reached the host, and has nothing when all answered', () => {
    const scans = [
      scan(1, { hosts: { b: down } }),
      scan(2, { hosts: { b: up } }),
      scan(3, { hosts: { b: down } }),
    ]
    expect(unreachableRuns(scans)).toEqual([{ host: 'b', since: 3, scans: 1 }])
    expect(unreachableRuns([scan(1, { hosts: { b: up } })])).toEqual([])
    expect(unreachableRuns([])).toEqual([])
  })
})
