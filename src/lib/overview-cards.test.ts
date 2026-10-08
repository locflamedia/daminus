import { describe, expect, it } from 'vitest'
import type { Item, Project, Report } from '@/api'
import timeline from '@/testing/fixtures/results.json'
import type { ResultsBundle } from '@/testing/results-bundle'
import { buildProjectCard, buildProjectCards, needsLook } from './overview-cards'

const bundle = timeline as unknown as ResultsBundle
const latest = bundle.reports['12'] as Report
const before = bundle.reports['11'] as Report
const NOW = Date.parse(latest.scanned_at ?? '')

function cards(report: Report = latest, baseline: Report | null = before) {
  return buildProjectCards(bundle.projects, report, baseline, bundle.rules, NOW)
}

function card(id: string, report?: Report, baseline?: Report | null) {
  const found = cards(report, baseline).find((c) => c.id === id)
  if (!found) throw new Error(`no card ${id}`)
  return found
}

describe('project cards of the timeline', () => {
  it('keeps the order of the rollups and takes the state from the core', () => {
    expect(cards().map((c) => [c.id, c.state])).toEqual([
      ['kho-hang', 'crit'],
      ['tiemtra', 'warn'],
      ['booking', 'ok'],
    ])
  })

  it('leads with the main issue of the rollup and lists the other checks once', () => {
    const kho = card('kho-hang')
    expect(kho.mainIssue?.key.check).toBe('url.exposed')
    expect(kho.otherChecks).toEqual(['sec.upload_php', 'sec.ports'])
    expect(kho.mainGroup).toBe('security')
  })

  it('counts passed checks over every result of the project, expected ones included', () => {
    expect(card('kho-hang')).toMatchObject({ passed: 10, total: 13 })
    expect(card('booking')).toMatchObject({ passed: 14, total: 14, expected: 2 })
  })

  it('names each topology node by role, and calls a lone backend the app', () => {
    const booking = card('booking')
    expect(booking.topology.map((n) => [n.label, n.host])).toEqual([
      ['APP', 'vps-sg-2'],
      ['WORKER', 'vps-sg-2'],
      ['DB', 'db-main'],
    ])
    expect(card('kho-hang').topology.map((n) => n.label)).toEqual(['FE', 'BE'])
  })

  it('tags compose, pm2 and each database engine once', () => {
    expect(card('tiemtra').tags).toEqual([
      { kind: 'pm2' },
      { kind: 'compose' },
      { kind: 'database', engine: 'postgres' },
    ])
  })
})

describe('metrics', () => {
  it('shows the worst URL: status, time, and what changed since the baseline', () => {
    const kho = card('kho-hang')
    expect(kho.uptime).toMatchObject({
      kind: 'value',
      status: 200,
      ms: 212,
      level: 'ok',
      was: null,
    })
  })

  it('sums the folders of the project and measures growth against the same folders', () => {
    const kho = card('kho-hang')
    expect(kho.disk).toMatchObject({ kind: 'value', bytes: 3457448673 })
    expect(kho.disk.kind === 'value' && kho.disk.delta).not.toBeNull()
  })

  it('says a project with no database component has none set up', () => {
    expect(card('kho-hang').db).toEqual({ kind: 'not-set-up' })
  })

  it('carries the database engine so MySQL can say its sizes lag', () => {
    const db = card('booking').db
    expect(db.kind === 'value' && db.engine).toBe('mysql')
    const pg = card('tiemtra').db
    expect(pg.kind === 'value' && pg.engine).toBe('postgres')
  })

  it('reports a database that cannot be read as unknown with its reason', () => {
    const item = latest.items.find(
      (i) => i.key.check === 'db.size' && i.key.target === 'booking',
    ) as Item
    const report: Report = {
      ...latest,
      items: latest.items.map((i) =>
        i === item
          ? {
              ...i,
              severity: { level: 'unknown', reason: 'needs_perm' },
              fact: { check: 'db.size', target: 'booking', unknown: 'needs_perm' },
            }
          : i,
      ),
    }
    expect(card('booking', report).db).toEqual({ kind: 'unknown', reason: 'needs_perm' })
  })

  it('marks a group switched off in Settings instead of a value', () => {
    const report: Report = { ...latest, disabled_groups: ['databases', 'disk'] }
    const booking = card('booking', report)
    expect(booking.db).toEqual({ kind: 'off' })
    expect(booking.disk).toEqual({ kind: 'off' })
    expect(booking.offGroups).toEqual(['databases', 'disk'])
  })

  it('has no growth to show without a baseline, and counts only folders both scans have', () => {
    const none = card('tiemtra', latest, null)
    expect(none.disk.kind === 'value' && none.disk.delta).toBeNull()
  })

  it('flags a size that grew by a tenth or more as notable', () => {
    const grown: Report = {
      ...latest,
      items: latest.items.map((i) =>
        i.key.check === 'db.size' && i.key.target === 'tiemtra' && i.fact
          ? { ...i, fact: { ...i.fact, value: (i.fact.value ?? 0) * 1.5 } }
          : i,
      ),
    }
    const db = card('tiemtra', grown, latest).db
    expect(db.kind === 'value' && db.notable).toBe(true)
    const still = card('tiemtra', latest, latest).db
    expect(still.kind === 'value' && still.notable).toBe(false)
  })
})

describe('card states', () => {
  const project = bundle.projects[0] as Project

  it('is unreachable when a host is silent and nothing worse is open', () => {
    const rollup = { ...latest.projects[2]!, unreachable_hosts: ['db-main'] }
    const built = buildProjectCard({
      project,
      rollup,
      report: latest,
      baseline: null,
      rules: [],
      now: NOW,
    })
    expect(built.state).toBe('unreachable')
    expect(built.unreachableHosts).toEqual(['db-main'])
  })

  it('lets a critical card stay critical when a host is silent', () => {
    const rollup = { ...latest.projects[0]!, unreachable_hosts: ['vps-hn-3'] }
    const built = buildProjectCard({
      project,
      rollup,
      report: latest,
      baseline: null,
      rules: [],
      now: NOW,
    })
    expect(built.state).toBe('crit')
  })

  it('puts a saved project the report does not know yet last, with no results', () => {
    const extra: Project = { id: 'fresh', name: 'fresh', urls: [], components: [] }
    const list = buildProjectCards([...bundle.projects, extra], latest, null, [], NOW)
    expect(list.at(-1)).toMatchObject({ id: 'fresh', total: 0, state: 'ok' })
    expect(list.at(-1)?.uptime).toEqual({ kind: 'not-set-up' })
  })

  it('wants a look for every state but ok', () => {
    expect(needsLook({ state: 'ok' })).toBe(false)
    expect(needsLook({ state: 'warn' })).toBe(true)
    expect(needsLook({ state: 'unreachable' })).toBe(true)
  })
})

describe('expected rules and old results', () => {
  it('counts the days to the review of an expected rule of the project', () => {
    const rule = bundle.rules[0]
    const report: Report = {
      ...latest,
      items: latest.items.map((i) =>
        i.disposition.kind === 'expected' && i.owner.kind === 'project' && i.owner.id === 'booking'
          ? { ...i, disposition: { kind: 'expected' as const, rule: rule!.id } }
          : i,
      ),
    }
    const soon = { ...rule!, until: '2026-09-29' }
    const built = buildProjectCards(bundle.projects, report, null, [soon], NOW)
    expect(built.find((c) => c.id === 'booking')?.reviewInDays).toBe(3)
  })

  it('reports the oldest scan its stale results were last checked in', () => {
    const stale: Report = {
      ...latest,
      items: latest.items.map((i) =>
        i.owner.kind === 'project' && i.owner.id === 'booking'
          ? { ...i, disposition: { kind: 'stale' as const, since_seq: 9 } }
          : i,
      ),
    }
    expect(card('booking', stale).staleSince).toBe(9)
  })
})
