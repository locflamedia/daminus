import { describe, expect, it } from 'vitest'
import type { Report } from '@/api'
import timeline from '@/testing/fixtures/results.json'
import type { ResultsBundle } from '@/testing/results-bundle'
import { buildServerCells, serverChip, serversNeedingLook } from './overview-servers'

const bundle = timeline as unknown as ResultsBundle
const latest = bundle.reports['12'] as Report
const NOW = Date.parse(latest.scanned_at ?? '') + 60_000

function cell(host: string, report: Report = latest) {
  const found = buildServerCells(report, NOW).find((c) => c.host === host)
  if (!found) throw new Error(`no cell ${host}`)
  return found
}

describe('buildServerCells', () => {
  it('reads disk, load and memory in use from the results of the host', () => {
    expect(cell('vps-sg-2')).toMatchObject({
      state: 'ok',
      disk: 87,
      diskTone: 'warn',
      load: 1.4,
      memUsed: 76,
    })
  })

  it('keeps the ring accent under 80 percent', () => {
    expect(cell('db-main')).toMatchObject({ disk: 41, diskTone: 'normal' })
  })

  it('shows a host that did not answer as unreachable, with the days of silence', () => {
    expect(cell('legacy-shop')).toMatchObject({ state: 'unreachable', silentDays: 7, stale: true })
  })

  it('has no days of silence for a host that answers or never did', () => {
    expect(cell('db-main').silentDays).toBeNull()
    const never = {
      ...latest,
      servers: latest.servers.map((s) =>
        s.host === 'legacy-shop' ? { ...s, last_reached_at: null, last_reached_seq: null } : s,
      ),
    }
    expect(cell('legacy-shop', never).silentDays).toBeNull()
  })

  it('marks a host left out of the scan', () => {
    const left = {
      ...latest,
      servers: latest.servers.map((s) => (s.host === 'db-main' ? { ...s, included: false } : s)),
    }
    expect(cell('db-main', left).state).toBe('not-scanned')
  })

  it('has no numbers when the report has no results of the host', () => {
    const empty = { ...latest, items: [] }
    expect(cell('vps-sg-2', empty)).toMatchObject({
      disk: null,
      load: null,
      memUsed: null,
      diskTone: 'normal',
    })
  })
})

describe('serverChip', () => {
  it('names the one server that needs a look and its disk', () => {
    expect(serversNeedingLook(latest)).toEqual(['vps-sg-2'])
    expect(serverChip(latest)).toEqual({ count: 1, check: 'disk.fs', pct: 87 })
  })

  it('is empty when every server is fine', () => {
    const calm = {
      ...latest,
      items: latest.items.map((i) => ({ ...i, severity: { level: 'ok' as const } })),
    }
    expect(serverChip(calm)).toBeNull()
  })

  it('gives only the count when several servers need a look', () => {
    const many = {
      ...latest,
      items: latest.items.map((i) =>
        i.key.check === 'disk.fs' && i.disposition.kind === 'active'
          ? {
              ...i,
              owner: { kind: 'server' as const, host: i.key.host },
              severity: { level: 'warn' as const },
            }
          : i,
      ),
    }
    expect(serverChip(many)).toEqual({ count: 4, check: null, pct: null })
  })
})
