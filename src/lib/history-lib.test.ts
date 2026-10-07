import { describe, expect, it } from 'vitest'
import type { Item, Project, Report, ScanFact, ScanSummary } from '@/api'
import { changesBetween } from './history-diff'
import { defaultPair, scansInRange, validPair } from './history-range'
import { leadingEntry, projectSeries, seriesDelta, topAt } from './history-series'
import { sameScanTrouble, stripCell, stripRows, STRIP_GROUPS } from './history-strip'

function scan(
  seq: number,
  day: number,
  checks: Record<string, 'ok' | 'info' | 'warn' | 'crit'>,
): ScanSummary {
  const at = new Date(Date.UTC(2026, 8, day, 6, 0)).toISOString()
  return {
    seq,
    started_at: at,
    finished_at: at,
    hosts: {},
    counts: { crit: 0, warn: 0, expected: 0, needs_perm: 0, stale: 0, unknown: 0 },
    info: 0,
    projects: [{ id: 'shop', crit: 0, warn: 0, info: 0, checks }],
  }
}

const scans = [1, 5, 10, 15, 20, 25, 26].map((day, i) => scan(i + 1, day, { 'url.http': 'ok' }))

describe('range and pair', () => {
  it('keeps the scans of the last days, counted from the newest scan', () => {
    expect(scansInRange(scans, '7d').map((s) => s.seq)).toEqual([5, 6, 7])
    expect(scansInRange(scans, '30d')).toHaveLength(7)
    expect(scansInRange(scans, 'all')).toHaveLength(7)
    expect(scansInRange([], '7d')).toEqual([])
  })

  it('compares the newest scan with the one four before it, or the oldest', () => {
    expect(defaultPair(scans)).toEqual({ from: 3, to: 7 })
    expect(defaultPair(scans.slice(0, 2))).toEqual({ from: 1, to: 2 })
    expect(defaultPair([])).toBeNull()
  })

  it('drops a pair that left the window', () => {
    expect(validPair({ from: 1, to: 7 }, scans.slice(3))).toEqual({ from: 4, to: 7 })
    expect(validPair({ from: 4, to: 7 }, scans)).toEqual({ from: 4, to: 7 })
    expect(validPair({ from: 7, to: 4 }, scans)).toEqual({ from: 3, to: 7 })
  })
})

describe('strip', () => {
  const group = (id: string) => STRIP_GROUPS.find((g) => g.id === id)!

  it('takes the worst level of the checks of a group and reads info as fine', () => {
    const s = scan(1, 1, { 'disk.fs': 'ok', 'disk.path': 'info', 'logs.big': 'warn' })
    expect(stripCell(s, 'shop', group('disk'))).toBe('warn')
    expect(stripCell(scan(1, 1, { 'disk.path': 'info' }), 'shop', group('disk'))).toBe('ok')
  })

  it('says not run when no check of the group answered', () => {
    expect(stripCell(scan(1, 1, { 'url.http': 'ok' }), 'shop', group('security'))).toBe('none')
    expect(stripCell(scan(1, 1, {}), 'other', group('disk'))).toBe('none')
  })

  it('reads a slow site as a slow response and only a down site as downtime', () => {
    const slow = scan(1, 1, { 'url.http': 'warn', 'url.tls': 'ok' })
    expect(stripCell(slow, 'shop', group('response'))).toBe('warn')
    expect(stripCell(slow, 'shop', group('uptime'))).toBe('ok')
    const down = scan(1, 1, { 'url.http': 'crit' })
    expect(stripCell(down, 'shop', group('uptime'))).toBe('crit')
  })

  it('gives five rows of one cell per scan', () => {
    const rows = stripRows(scans, 'shop')
    expect(rows.map((r) => r.id)).toEqual(['uptime', 'response', 'disk', 'containers', 'security'])
    expect(rows.every((r) => r.cells.length === scans.length)).toBe(true)
  })
})

const project: Project = {
  id: 'shop',
  name: 'shop',
  urls: ['https://shop.test', 'https://api.shop.test'],
  components: [
    { role: 'be', host: 'vps-1', kind: 'path', path: '/srv/shop' },
    {
      role: 'db',
      host: 'vps-2',
      kind: 'db',
      engine: 'postgres',
      database: 'shop',
      env_file: '/srv/shop/.env',
    },
  ],
}

function fact(
  seq: number,
  host: string,
  check: string,
  target: string,
  value: number,
  data = {},
): ScanFact {
  return {
    seq,
    at: new Date(Date.UTC(2026, 8, seq, 6)).toISOString(),
    host,
    fact: { check, target, value, data },
  }
}

describe('series', () => {
  const facts = [
    fact(1, 'vps-1', 'disk.path', '/srv/shop', 100),
    fact(1, 'vps-1', 'disk.path', '/srv/other', 999),
    fact(2, 'vps-1', 'disk.path', '/srv/shop', 150),
    fact(1, 'vps-2', 'db.size', 'shop', 10),
    fact(2, 'vps-2', 'db.size', 'shop', 12),
    fact(2, '@local', 'url.http', 'https://shop.test', 200),
    fact(2, '@local', 'url.http', 'https://api.shop.test', 90),
    fact(3, '@local', 'url.http', 'https://shop.test', 300),
  ]

  it('sums only the folders, databases and first URL of the project', () => {
    const s = projectSeries(facts, project, new Set([1, 2, 3]))
    expect(s.disk.map((p) => p.value)).toEqual([100, 150])
    expect(s.database.map((p) => p.value)).toEqual([10, 12])
    expect(s.response.map((p) => p.value)).toEqual([200, 300])
  })

  it('leaves out scans outside the window and measures a change between two scans', () => {
    const s = projectSeries(facts, project, new Set([2]))
    expect(s.disk).toHaveLength(1)
    const all = projectSeries(facts, project, new Set([1, 2]))
    expect(seriesDelta(all.disk, 1, 2)).toEqual({ from: 100, to: 150, change: 50 })
    expect(seriesDelta(all.disk, 1, 9)).toBeNull()
  })
})

const MB = 1024 * 1024

function item(check: string, target: string, level: Item['severity'], fact: Item['fact']): Item {
  return {
    key: { host: 'vps-1', check, target },
    group: 'disk',
    owner: { kind: 'project', id: 'shop' },
    severity: level,
    disposition: { kind: 'active' },
    fact,
  }
}

function report(items: Item[]): Report {
  return {
    seq: 1,
    evaluated_at: '2026-09-26T06:00:00Z',
    items,
    projects: [],
    servers: [],
    disabled_groups: [],
    rules_due: [],
    counts: { crit: 0, warn: 0, expected: 0, needs_perm: 0, stale: 0, unknown: 0 },
  }
}

describe('changesBetween', () => {
  const folder = (logs: number) =>
    item(
      'disk.path',
      '/srv/shop',
      { level: 'info' },
      {
        check: 'disk.path',
        target: '/srv/shop',
        value: 1,
        data: {
          top: [
            ['storage/logs', logs],
            ['public', 500 * MB],
          ],
        },
      },
    )

  it('names the folder that grew most and leaves small changes out', () => {
    const rows = changesBetween({
      from: report([folder(100 * MB)]),
      to: report([folder(1100 * MB)]),
      projectId: 'shop',
      scans: [],
      response: [],
      locale: 'en',
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      kind: 'grew',
      title: 'folderGrew',
      params: { name: 'storage/logs' },
    })
    const small = changesBetween({
      from: report([folder(100 * MB)]),
      to: report([folder(101 * MB)]),
      projectId: 'shop',
      scans: [],
      response: [],
      locale: 'en',
    })
    expect(small).toEqual([])
  })

  it('reports restarts that began and an image that changed', () => {
    const compose = (restarts: number, image: string) =>
      item(
        'docker.compose',
        'shop',
        { level: 'ok' },
        {
          check: 'docker.compose',
          target: 'shop',
          data: { services: [{ name: 'worker', restarts, image }] },
        },
      )
    const rows = changesBetween({
      from: report([compose(0, 'app:1.4')]),
      to: report([compose(3, 'app:1.5')]),
      projectId: 'shop',
      scans: [],
      response: [],
      locale: 'en',
    })
    expect(rows.map((r) => r.title).sort()).toEqual(['imageUpdated', 'restarts'])
    expect(rows.find((r) => r.title === 'restarts')?.value).toBe('3')
  })

  it('shows a certificate that was renewed as fixed with its days', () => {
    const tls = (days: number, level: Item['severity']) =>
      item('url.tls', 'https://shop.test', level, {
        check: 'url.tls',
        target: 'https://shop.test',
        value: days,
      })
    const rows = changesBetween({
      from: report([tls(12, { level: 'warn' })]),
      to: report([tls(74, { level: 'ok' })]),
      projectId: 'shop',
      scans: [],
      response: [],
      locale: 'en',
    })
    expect(rows[0]).toMatchObject({
      kind: 'fixed',
      title: 'tlsRenewed',
      subParams: { from: 12, to: 74 },
    })
  })

  it('says a slow answer recovered, with its worst time', () => {
    const run = [
      scan(1, 1, { 'url.http': 'ok' }),
      scan(2, 2, { 'url.http': 'warn' }),
      scan(3, 3, { 'url.http': 'ok' }),
    ]
    const point = (seq: number, value: number) => ({ seq, at: seq, value })
    const rows = changesBetween({
      from: report([]),
      to: report([]),
      projectId: 'shop',
      scans: run,
      response: [point(1, 180), point(2, 1840), point(3, 212)],
      locale: 'en',
    })
    expect(rows.find((r) => r.id === 'response-recovered')?.subParams).toMatchObject({ seq: 2 })
  })

  it('says security stayed clean only when every scan in between was clean', () => {
    const clean = [scan(1, 1, { 'sec.miner': 'ok' }), scan(2, 2, { 'sec.miner': 'ok' })]
    const input = {
      from: report([]),
      to: report([]),
      projectId: 'shop',
      response: [],
      locale: 'en' as const,
    }
    expect(changesBetween({ ...input, scans: clean }).map((r) => r.id)).toContain('security-clean')
    const dirty = [clean[0]!, scan(2, 2, { 'sec.miner': 'crit' })]
    expect(changesBetween({ ...input, scans: dirty }).map((r) => r.id)).not.toContain(
      'security-clean',
    )
  })
})

describe('sameScanTrouble', () => {
  it('points at the worst other group that turned in the scan', () => {
    const s = scan(1, 1, { 'url.http': 'warn', 'docker.compose': 'warn', 'disk.fs': 'crit' })
    expect(sameScanTrouble(s, 'shop', ['response', 'uptime'])).toEqual({
      group: 'disk',
      state: 'crit',
    })
    expect(sameScanTrouble(s, 'shop', ['response', 'uptime', 'disk'])).toEqual({
      group: 'containers',
      state: 'warn',
    })
    expect(sameScanTrouble(scan(2, 2, { 'url.http': 'warn' }), 'shop', ['response'])).toBeNull()
  })
})

describe('top entries', () => {
  const withTop = (seq: number, top: unknown) => fact(seq, 'vps-2', 'db.size', 'shop', 1, { top })
  const facts = [
    withTop(1, [
      ['orders', 100],
      ['users', 50],
    ]),
    withTop(2, [
      ['orders', 600],
      ['users', 55],
    ]),
  ]

  it('reads the entries of the project in one scan', () => {
    expect(topAt(facts, project, 'db.size', 2).get('orders')).toBe(600)
    expect(topAt(facts, project, 'disk.path', 2).size).toBe(0)
  })

  it('leads with what grew most, or the largest when nothing grew', () => {
    const before = topAt(facts, project, 'db.size', 1)
    const after = topAt(facts, project, 'db.size', 2)
    expect(leadingEntry(after, before)).toMatchObject({ name: 'orders', growth: 500 })
    expect(leadingEntry(before, before)).toMatchObject({ name: 'orders', growth: null })
    expect(leadingEntry(new Map(), new Map())).toBeNull()
  })
})
