import { describe, expect, it } from 'vitest'
import type { Item, ScanFact } from '@/api'
import {
  dirOf,
  diskSeries,
  diskTiles,
  freeable,
  largeFiles,
  listLogsCommand,
  logFindings,
  parseDiskPath,
  previousSizes,
  serverDisks,
  type DiskPathView,
} from './project-disk'

const fmt = { size: (b: number) => `${b} B`, delta: (b: number) => `+${b}`, none: 'same' }

const pathItem = (): Item =>
  ({
    key: { host: 'h', check: 'disk.path', target: '/srv/app' },
    owner: { kind: 'project', id: 'p' },
    severity: { level: 'info' },
    fact: {
      check: 'disk.path',
      target: '/srv/app',
      value: 1000,
      data: {
        top: [
          ['uploads', 600],
          ['logs', 300],
        ],
        other: 100,
        files: [
          ['logs/a.log', 250],
          ['uploads/b.mov', 400],
        ],
        partial: false,
      },
    },
  }) as unknown as Item

const fact = (seq: number, top: [string, number][], value = 0): ScanFact =>
  ({
    seq,
    at: `2026-09-${10 + seq}T00:00:00Z`,
    host: 'h',
    fact: { check: 'disk.path', target: '/srv/app', value, data: { top } },
  }) as unknown as ScanFact

describe('disk tiles', () => {
  const views = [parseDiskPath(pathItem())!]

  it('makes a tile per folder and one grey tile for the rest', () => {
    const tiles = diskTiles(views, new Map(), fmt)
    expect(tiles.map((t) => t.tile.label)).toEqual(['uploads', 'logs', 'other'])
    expect(tiles[2]?.tile.other).toBe(true)
  })

  it('rings only a folder that gained a tenth of its size and says no change for the rest', () => {
    const before = new Map([
      ['h:/srv/app/uploads', 590],
      ['h:/srv/app/logs', 100],
    ])
    const [uploads, logs] = diskTiles(views, before, fmt)
    expect(uploads?.tile.grow).toBe(false)
    expect(uploads?.tile.delta).toBe('+10')
    expect(logs?.tile.grow).toBe(true)
    expect(logs?.growth).toBe(200)
  })

  it('also rings the fastest grower when it is a small share of a big folder, once it gained a row-worthy amount', () => {
    const MB = 1024 * 1024
    const big: DiskPathView = {
      ...views[0]!,
      top: [
        { name: 'storage', bytes: 1200 * MB },
        { name: 'uploads', bytes: 2600 * MB },
      ],
    }
    const before = new Map([
      ['h:/srv/app/storage', 1098 * MB],
      ['h:/srv/app/uploads', 2600 * MB],
    ])
    const [storage, uploads] = diskTiles([big], before, fmt)
    expect(storage?.tile.grow).toBe(true)
    expect(uploads?.tile.grow).toBe(false)
  })

  it('does not ring a growth too small to be worth a row', () => {
    const MB = 1024 * 1024
    const small: DiskPathView = { ...views[0]!, top: [{ name: 'storage', bytes: 1200 * MB }] }
    const [storage] = diskTiles([small], new Map([['h:/srv/app/storage', 1195 * MB]]), fmt)
    expect(storage?.tile.grow).toBe(false)
  })

  it('has no growth for a folder the previous scan did not list', () => {
    const [first] = diskTiles(views, new Map(), fmt)
    expect(first?.growth).toBeNull()
    expect(first?.tile.delta).toBeUndefined()
  })

  it('reads the previous scan before the one given', () => {
    const facts = [fact(1, [['uploads', 1]]), fact(2, [['uploads', 2]]), fact(3, [['uploads', 3]])]
    expect(previousSizes(facts, views, 3).get('h:/srv/app/uploads')).toBe(2)
    expect(previousSizes(facts, views, null).size).toBe(0)
  })
})

describe('disk curve and files', () => {
  it('sums project folders per scan', () => {
    const views = [{ host: 'h', path: '/srv/app' }]
    const series = diskSeries([fact(1, [], 10), fact(2, [], 30)], views)
    expect(series.map((p) => p.value)).toEqual([10, 30])
  })

  it('lists files biggest first and flags one a large-log result names', () => {
    const log = {
      key: { host: 'h', check: 'logs.big', target: '/srv/app/logs/a.log' },
      fact: { check: 'logs.big', target: '/srv/app/logs/a.log', value: 250 },
    } as unknown as Item
    const files = largeFiles([parseDiskPath(pathItem())!], [log])
    expect(files.map((f) => f.name)).toEqual(['uploads/b.mov', 'logs/a.log'])
    expect(files.map((f) => f.finding)).toEqual([false, true])
  })

  it('leaves out a large-log result that found nothing', () => {
    const none = {
      key: { host: 'h', check: 'logs.big', target: '' },
      fact: { check: 'logs.big', target: '', value: 0 },
    } as unknown as Item
    expect(logFindings([none])).toEqual([])
  })
})

describe('shared disks and free space', () => {
  const all = [
    pathItem(),
    {
      key: { host: 'h', check: 'disk.fs', target: '/' },
      owner: { kind: 'server', host: 'h' },
      fact: { check: 'disk.fs', target: '/', data: { pct: 87 } },
    },
    {
      key: { host: 'h', check: 'docker.df', target: '' },
      owner: { kind: 'server', host: 'h' },
      fact: {
        check: 'docker.df',
        target: '',
        value: 900,
        data: { build_cache: { reclaimable: 500 }, images: { reclaimable: 0 } },
      },
    },
  ] as unknown as Item[]

  it('shows who takes the space on a host', () => {
    const [disk] = serverDisks(all, ['h'])
    expect(disk?.pct).toBe(87)
    expect(disk?.shares).toEqual([
      { label: 'p', bytes: 1000 },
      { label: 'docker', bytes: 900, docker: true },
    ])
  })

  it('offers only what Docker says it can reclaim and the large logs', () => {
    expect(freeable(all, ['h'])).toEqual([{ kind: 'buildCache', host: 'h', bytes: 500 }])
  })
})

describe('log commands', () => {
  it('lists the folder of the file', () => {
    expect(dirOf('/srv/app/logs/a.log')).toBe('/srv/app/logs')
    expect(listLogsCommand('h', '/srv/app/logs')).toBe('ssh h "ls -lhS /srv/app/logs | head"')
  })

  it('refuses a folder with shell syntax', () => {
    expect(listLogsCommand('h', '/srv/$(id)')).toBeNull()
  })
})
