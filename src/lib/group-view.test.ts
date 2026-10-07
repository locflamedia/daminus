import { describe, expect, it } from 'vitest'
import type { SetupRecord } from '@/api'
import type { DraftPart, DraftProject } from '@/lib/setup-model'
import type { LooseItem } from '@/stores/setup-drafts'
import {
  changedLines,
  checklist,
  dbPort,
  engineName,
  freeId,
  groupLoose,
  jsonSegments,
  liveText,
  looseDetail,
  needsAttention,
  orderForGroup,
  pairingLine,
  partSource,
  replacedCounts,
  showNewTag,
} from './group-view'

const db = (over: Partial<Extract<DraftPart, { kind: 'db' }>> = {}): DraftPart => ({
  key: 'p-db',
  role: 'db',
  host: 'h1',
  kind: 'db',
  engine: 'mysql',
  database: '',
  envFile: '',
  container: null,
  ...over,
})

const draft = (over: Partial<DraftProject> = {}): DraftProject => ({
  key: 'd1',
  id: 'shop',
  name: 'shop',
  color: null,
  urls: ['https://shop.example'],
  parts: [],
  envFiles: [],
  isNew: true,
  idFollowsName: false,
  ...over,
})

const pm2 = (over: Partial<Extract<DraftPart, { kind: 'pm2' }>> = {}): DraftPart => ({
  key: 'p-fe',
  role: 'fe',
  host: 'h1',
  kind: 'pm2',
  app: 'shop-web',
  pm2Home: null,
  ...over,
})

const be: DraftPart = { key: 'p-be', role: 'be', host: 'h1', kind: 'path', path: '/var/www/shop' }

describe('ordering', () => {
  it('puts the project missing a database name first and keeps the rest in order', () => {
    const a = draft({ key: 'a', parts: [be] })
    const b = draft({ key: 'b', parts: [db()] })
    const c = draft({ key: 'c', parts: [be] })
    expect(orderForGroup([a, b, c]).map((d) => d.key)).toEqual(['b', 'a', 'c'])
    expect(needsAttention(b)).toBe(true)
    expect(needsAttention(a)).toBe(false)
  })

  it('keeps a card pinned at the top after it was completed', () => {
    const a = draft({ key: 'a', parts: [be] })
    const b = draft({ key: 'b', parts: [db({ database: 'x', envFile: '/e' })] })
    expect(orderForGroup([a, b], new Set(['b'])).map((d) => d.key)).toEqual(['b', 'a'])
  })
})

describe('parts', () => {
  it('names the source of each kind', () => {
    expect(partSource(be)).toEqual({ kind: 'path', name: '/var/www/shop' })
    expect(partSource(pm2())).toEqual({ kind: 'pm2', name: 'shop-web' })
    expect(partSource(db({ container: 'shop-db-1' }))).toEqual({
      kind: 'container',
      name: 'shop-db-1',
    })
    expect(partSource(db())).toEqual({ kind: 'engine', name: 'mysql' })
  })

  it('reads a database port from the listening process only', () => {
    const records: SetupRecord[] = [
      { rec: 'port', port: 5173, bind: 'loopback', proc: 'node' },
      { rec: 'port', port: 3306, bind: 'loopback', proc: 'mysqld' },
    ]
    expect(dbPort('mysql', records)).toBe(3306)
    expect(dbPort('postgres', records)).toBeNull()
    expect(engineName(db(), records)).toBe('mysql · :3306')
    expect(engineName(db(), [])).toBe('mysql')
  })

  it('says what discover saw: pm2, compose, site, env', () => {
    const records: SetupRecord[] = [
      {
        rec: 'pm2',
        app: 'shop-web',
        home: '/h/.pm2',
        default: true,
        instances: 2,
        status: 'online',
      },
      {
        rec: 'compose',
        project: 'shop-api',
        services: ['a', 'b'],
        running: 1,
        total: 2,
        ports: [],
      },
      {
        rec: 'vhost',
        file: '/etc/nginx/x',
        names: ['shop.example'],
        root: '/var/www/shop/public',
        ssl: true,
        php: true,
        listen: [443],
      },
      { rec: 'env', path: '/var/www/shop/.env', readable: true },
    ]
    expect(liveText(pm2(), records)).toMatchObject({
      tone: 'ok',
      words: { key: 'setupGroup.live.pm2', params: { status: 'online' }, n: 2 },
    })
    expect(
      liveText({ key: 'c', role: 'be', host: 'h1', kind: 'compose', project: 'shop-api' }, records),
    ).toMatchObject({ tone: 'warn', words: { params: { up: 1, total: 2 } } })
    expect(liveText(be, records)?.words.key).toBe('setupGroup.live.sitePhp')
    expect(liveText(db({ database: 'd', envFile: '/var/www/shop/.env' }), records)?.words.key).toBe(
      'setupGroup.live.dbEnv',
    )
  })

  it('says nothing when no record is behind the part', () => {
    expect(liveText(pm2(), [])).toBeNull()
    expect(liveText(be, [])).toBeNull()
    expect(liveText(db(), [])).toBeNull()
  })
})

describe('pairing line', () => {
  const records: SetupRecord[] = [
    {
      rec: 'pm2',
      app: 'shop-web',
      home: '/h',
      default: true,
      instances: 1,
      status: 'online',
      cwd: '/var/www/shop',
    },
    { rec: 'port', port: 5173, bind: 'loopback', proc: 'node', cwd: '/var/www/shop' },
  ]

  it('builds the pieces the records support', () => {
    const d = draft({ parts: [be, pm2(), db()] })
    const out = pairingLine(d, () => records)
    expect(out.map((w) => w.key)).toEqual([
      'setupGroup.pair.beServes',
      'setupGroup.pair.fePort',
      'setupGroup.pair.dbSame',
    ])
    expect(out[0]?.params.url).toBe('shop.example')
    expect(out[1]?.params.port).toBe(5173)
  })

  it('omits the port without a record and the whole line without both roles', () => {
    expect(pairingLine(draft({ parts: [be, pm2()] }), () => []).map((w) => w.key)).toEqual([
      'setupGroup.pair.beServes',
    ])
    expect(pairingLine(draft({ parts: [be] }), () => records)).toEqual([])
  })

  it('names the host of a database elsewhere', () => {
    const out = pairingLine(draft({ parts: [be, pm2(), db({ host: 'db-main' })] }), () => [])
    expect(out.at(-1)).toMatchObject({ key: 'setupGroup.pair.dbOn', params: { host: 'db-main' } })
  })
})

describe('checklist', () => {
  it('is green when nothing is missing', () => {
    const lines = checklist([draft({ parts: [be, db({ database: 'd', envFile: '/e' })] })])
    expect(lines.every((l) => l.ok)).toBe(true)
  })

  it('counts projects without URL and databases without .env or name', () => {
    const lines = checklist([
      draft({ urls: [], parts: [be, db()] }),
      draft({ key: 'd2', parts: [be, db({ envFile: '/e' })] }),
    ])
    expect(lines[0]).toMatchObject({ ok: false, words: { key: 'setupGroup.check.urlsMissing' } })
    expect(lines[2]).toMatchObject({
      ok: false,
      words: { key: 'setupGroup.check.dbNoEnv', params: { n: 1 } },
    })
  })

  it('flags a name that is missing when every database has its .env', () => {
    const lines = checklist([draft({ parts: [be, db({ envFile: '/e' })] })])
    expect(lines[2]?.words.key).toBe('setupGroup.check.dbNoName')
  })

  it('flags a project that has no front end or back end', () => {
    expect(checklist([draft({ parts: [db({ database: 'd', envFile: '/e' })] })])[1]?.ok).toBe(false)
  })
})

describe('leftovers', () => {
  const item = (over: Partial<LooseItem>): LooseItem => ({
    key: 'k',
    host: 'h1',
    kind: 'pm2',
    name: 'x',
    detail: { code: 'no_folder' },
    ...over,
  })

  it('groups by host in first-seen order and by kind inside a host', () => {
    const groups = groupLoose([
      item({ key: '1', host: 'b', kind: 'env' }),
      item({ key: '2', host: 'a', kind: 'db' }),
      item({ key: '3', host: 'b', kind: 'vhost' }),
    ])
    expect(groups.map((g) => g.host)).toEqual(['b', 'a'])
    expect(groups[0]?.items.map((i) => i.kind)).toEqual(['vhost', 'env'])
  })

  it('turns the detail code into a message', () => {
    expect(looseDetail(item({ detail: { code: 'no_site', n: 1 } }))).toMatchObject({
      key: 'setupGroup.loose.noSite',
      n: 1,
    })
    expect(looseDetail(item({ detail: { code: 'runs_from', text: '/srv/jobs' } })).params).toEqual({
      dir: '/srv/jobs',
    })
    expect(looseDetail(item({ detail: { code: 'by_hand' } })).key).toBe('setupGroup.loose.by_hand')
  })
})

describe('replaced counts', () => {
  it('counts URLs that are filled and every part', () => {
    expect(replacedCounts(draft({ urls: ['a', ' '], parts: [be, db()] }))).toEqual({
      urls: 1,
      parts: 2,
    })
  })
})

describe('preview helpers', () => {
  it('colours keys, strings and numbers apart', () => {
    expect(jsonSegments('  "version": 1,')).toEqual([
      { text: '  ', kind: 'punct' },
      { text: '"version"', kind: 'key' },
      { text: ':', kind: 'punct' },
      { text: ' ', kind: 'punct' },
      { text: '1', kind: 'num' },
      { text: ',', kind: 'punct' },
    ])
    expect(jsonSegments('{ "id": "a-1", … 4 parts }').map((s) => s.kind)).toContain('str')
    expect(
      jsonSegments('{ "id": "a-1", … 4 parts }')
        .map((s) => s.text)
        .join(''),
    ).toBe('{ "id": "a-1", … 4 parts }')
  })

  it('finds the lines that changed', () => {
    expect([...changedLines(['a', 'b', 'c'], ['a', 'x', 'c', 'd'])]).toEqual([1, 3])
  })

  it('finds the next free id', () => {
    expect(freeId('shop', new Set(['shop', 'shop-2']))).toBe('shop-3')
  })
})

describe('the New tag', () => {
  it('shows for an unsaved project and gives way to the Already saved chip', () => {
    expect(showNewTag({ isNew: true }, false)).toBe(true)
    expect(showNewTag({ isNew: true }, true)).toBe(false)
    expect(showNewTag({ isNew: false }, false)).toBe(false)
  })
})
