import { describe, expect, it } from 'vitest'
import type { HistoryView, Item, Project, ScanFact } from '@/api'
import {
  needsLook,
  overviewTiles,
  partRows,
  responseStrip,
  slowestBad,
  toneOf,
  wiring,
} from './project-overview'

const make = (check: string, host: string, target: string, extra: Partial<Item> = {}): Item =>
  ({
    key: { host, check, target },
    group: 'disk',
    owner: { kind: 'project', id: 'p' },
    severity: { level: 'ok' },
    disposition: { kind: 'active' },
    ...extra,
  }) as Item

const project: Project = {
  id: 'p',
  name: 'p',
  urls: ['https://p.dev'],
  components: [
    { role: 'fe', host: 'a', kind: 'path', path: '/srv/web' },
    { role: 'be', host: 'b', kind: 'compose', project: 'api' },
    { role: 'worker', host: 'b', kind: 'pm2', app: 'jobs' },
    { role: 'db', host: 'b', kind: 'db', engine: 'postgres', database: 'shop', env_file: '/e' },
  ],
}

describe('parts and wiring', () => {
  const items = [
    make('docker.compose', 'b', 'api', {
      severity: { level: 'warn' },
      fact: {
        check: 'docker.compose',
        target: 'api',
        data: {
          running: 2,
          not_running: 0,
          restarts: 1,
          containers: 2,
          services: [
            { name: 'x', cpu: 1.5, mem: 100 },
            { name: 'y', cpu: 2, mem: 50 },
          ],
        },
      },
    }),
    make('db.size', 'b', 'shop', {
      fact: {
        check: 'db.size',
        target: 'shop',
        value: 500,
        data: { engine: 'postgres', tables: 3 },
      },
    }),
  ]

  it('gives each saved part a row with the state of its own check', () => {
    const rows = partRows(project, items)
    expect(rows.map((r) => r.kind)).toEqual(['path', 'compose', 'pm2', 'db'])
    expect(rows[1]).toMatchObject({ tone: 'warn', cpu: 3.5, mem: 150 })
    expect(rows[2]?.tone).toBe('unknown')
    expect(rows[3]?.state).toMatchObject({ kind: 'db', bytes: 500, tables: 3 })
  })

  it('groups parts by tier and marks a data band on a host another band uses', () => {
    const bands = wiring(partRows(project, items))
    expect(bands.map((b) => b.tier)).toEqual(['fe', 'app', 'db'])
    expect(bands.map((b) => b.data)).toEqual([false, false, true])
    expect(bands[1]?.nodes.map((n) => n.role)).toEqual(['be', 'worker'])
  })
})

describe('what needs a look', () => {
  const warn = make('docker.compose', 'b', 'api', {
    group: 'containers',
    severity: { level: 'warn' },
  })
  const crit = make('db.size', 'b', 'shop', { group: 'databases', severity: { level: 'crit' } })
  const perm = make('db.size', 'b', 'x', {
    group: 'databases',
    severity: { level: 'unknown', reason: 'needs_perm' },
  })
  const expected = make('sec.ports', 'b', '', {
    severity: { level: 'warn' },
    disposition: { kind: 'expected', rule: 'r' },
  })
  const server = make('disk.fs', 'b', '/', {
    group: 'disk',
    owner: { kind: 'server', host: 'b' },
    severity: { level: 'warn' },
  })
  const other = make('disk.fs', 'z', '/', {
    owner: { kind: 'server', host: 'z' },
    severity: { level: 'crit' },
  })

  it('lists warnings, critical and permission results, worst first, with where each links', () => {
    const rows = needsLook([warn, crit, perm, expected, server, other], 'p', ['b'])
    expect(rows.map((r) => r.level)).toEqual(['crit', 'warn', 'warn', 'unknown'])
    expect(rows.find((r) => r.item === server)?.target).toEqual({ host: 'b' })
    expect(rows.find((r) => r.item === warn)?.target).toEqual({ tab: 'containers' })
    expect(rows.some((r) => r.item === expected || r.item === other)).toBe(false)
  })

  it('leaves out stale results', () => {
    const stale = make('docker.compose', 'b', 'api', {
      severity: { level: 'warn' },
      disposition: { kind: 'stale', since_seq: 3 },
    })
    expect(needsLook([stale], 'p', ['b'])).toEqual([])
  })
})

describe('the four numbers', () => {
  const facts = [1, 2, 3, 4].map(
    (seq) =>
      ({
        seq,
        at: '',
        host: 'a',
        fact: { check: 'disk.path', target: '/srv/web', value: seq * 10 },
      }) as unknown as ScanFact,
  )

  it('sums folders, follows the series and takes the change from the last two scans', () => {
    const disk = make('disk.path', 'a', '/srv/web', {
      fact: { check: 'disk.path', target: '/srv/web', value: 40 },
    })
    const tiles = overviewTiles([disk], facts, [])
    const tile = tiles.find((t) => t.id === 'disk')
    expect(tile).toMatchObject({ value: 40, delta: 10, series: [10, 20, 30, 40] })
  })

  it('says not set up when there is nothing of a kind, and needs permission when so told', () => {
    const perm = make('db.size', 'b', 'shop', {
      severity: { level: 'unknown', reason: 'needs_perm' },
      fact: { check: 'db.size', target: 'shop', unknown: 'needs_perm' },
    })
    const tiles = overviewTiles([perm], [], [])
    expect(tiles.find((t) => t.id === 'database')).toMatchObject({
      value: null,
      empty: 'needs_perm',
    })
    expect(tiles.find((t) => t.id === 'disk')?.empty).toBe('none')
  })

  it('reads the status code and time of the first URL', () => {
    const http = make('url.http', '@local', 'https://p.dev', {
      fact: {
        check: 'url.http',
        target: 'https://p.dev',
        value: 142,
        data: { status: 200, class: '2xx' },
      },
    })
    expect(overviewTiles([http], [], ['https://p.dev'])[0]).toMatchObject({
      value: 142,
      status: '200',
    })
  })

  it('draws a state dot from the severity of the item', () => {
    expect(toneOf(make('x', 'h', '', { severity: { level: 'crit' } }))).toBe('crit')
    expect(toneOf(undefined)).toBe('unknown')
  })
})

describe('response strip', () => {
  const history = {
    scans: [1, 2, 3].map((seq) => ({
      seq,
      projects: [{ id: 'p', checks: { 'url.http': seq === 2 ? 'warn' : 'ok' } }],
    })),
  } as unknown as HistoryView
  const facts = [1, 2, 3].map(
    (seq) =>
      ({
        seq,
        at: '',
        host: '@local',
        fact: { check: 'url.http', target: 'https://p.dev', value: seq === 2 ? 1840 : 180 },
      }) as unknown as ScanFact,
  )

  it('colours each scan by the core grade and keeps the slowest answer', () => {
    const cells = responseStrip(history, 'p', facts, ['https://p.dev'])
    expect(cells.map((c) => c.level)).toEqual(['ok', 'warn', 'ok'])
    expect(slowestBad(cells)).toMatchObject({ seq: 2, ms: 1840 })
  })

  it('marks a scan with no grade as none', () => {
    const cells = responseStrip(history, 'other', facts, ['https://p.dev'])
    expect(cells.every((c) => c.level === 'none')).toBe(true)
  })
})
