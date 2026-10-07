import { describe, expect, it } from 'vitest'
import type { SetupRecord } from '@/api'
import type { DraftPart, DraftProject } from './setup-model'
import {
  applySuggestion,
  badPath,
  discoveredOn,
  foundCount,
  hostForKind,
  isBlank,
  newPart,
  partState,
  savable,
  suggestionsFor,
} from './sheet-parts'

const records: SetupRecord[] = [
  {
    rec: 'pm2',
    app: 'tiemtra-web',
    home: '/root/.pm2',
    default: true,
    instances: 2,
    status: 'online',
    cwd: null,
  },
  {
    rec: 'pm2',
    app: 'tiemtra-cron',
    home: '/root/.pm2',
    default: true,
    instances: 1,
    status: 'online',
    cwd: null,
  },
  {
    rec: 'pm2',
    app: 'old',
    home: '/home/x/.pm2',
    default: false,
    instances: 1,
    status: 'stopped',
    cwd: null,
  },
  {
    rec: 'compose',
    project: 'tiemtra-api',
    dir: null,
    services: ['a'],
    running: 4,
    total: 4,
    ports: [],
  },
  {
    rec: 'vhost',
    file: 'f',
    names: ['tiemtra.vn'],
    root: '/var/www/tiemtra',
    proxy: null,
    ssl: true,
    php: true,
    listen: [443],
  },
  {
    rec: 'vhost',
    file: 'g',
    names: ['proxy.vn'],
    root: null,
    proxy: 'http://x',
    ssl: false,
    php: false,
    listen: [80],
  },
]

const web: DraftPart = {
  key: 'p1',
  role: 'fe',
  host: 'h',
  kind: 'pm2',
  app: 'tiemtra-web',
  pm2Home: null,
}

describe('discovery of a host', () => {
  it('sorts the records and counts them per kind', () => {
    const found = discoveredOn(records)
    expect(foundCount('pm2', found)).toBe(3)
    expect(foundCount('compose', found)).toBe(1)
    expect(foundCount('nginx', found)).toBe(2)
    expect(foundCount('folder', found)).toBeNull()
    expect(foundCount('database', found)).toBeNull()
  })

  it('has empty lists with no records', () => {
    expect(foundCount('pm2', discoveredOn([]))).toBe(0)
    expect(suggestionsFor('pm2', discoveredOn([]), [], 'h')).toEqual([])
  })

  it('starts a part on the first server that has finds of its kind', () => {
    const recordsOf = (h: string) => (h === 'b' ? records : [])
    expect(hostForKind('pm2', ['a', 'b'], recordsOf, 'a')).toBe('b')
    expect(hostForKind('pm2', ['a'], recordsOf, 'a')).toBe('a')
    expect(hostForKind('folder', ['a', 'b'], recordsOf, 'a')).toBe('a')
  })
})

describe('suggestionsFor', () => {
  it('marks what the project already has on that server', () => {
    const list = suggestionsFor('pm2', discoveredOn(records), [web], 'h')
    expect(list.map((s) => [s.name, s.taken, s.live])).toEqual([
      ['tiemtra-web', true, true],
      ['tiemtra-cron', false, true],
      ['old', false, false],
    ])
    expect(list[2]?.pm2Home).toBe('/home/x/.pm2')
    expect(list[0]?.pm2Home).toBeNull()
  })

  it('offers only nginx sites that have a folder', () => {
    const list = suggestionsFor('path', discoveredOn(records), [], 'h')
    expect(list.map((s) => s.name)).toEqual(['/var/www/tiemtra'])
  })

  it('does not count the part being edited as taken', () => {
    const list = suggestionsFor('pm2', discoveredOn(records), [web], 'h', web)
    expect(list[0]?.taken).toBe(false)
  })
})

describe('applySuggestion', () => {
  it('makes a worker-like pm2 app a worker, and keeps the role of other names', () => {
    const empty = newPart('pm2', 'h')
    const [, cron] = suggestionsFor('pm2', discoveredOn(records), [], 'h')
    expect(applySuggestion(empty, cron!)).toMatchObject({ app: 'tiemtra-cron', role: 'worker' })
    const [first] = suggestionsFor('pm2', discoveredOn(records), [], 'h')
    expect(applySuggestion(empty, first!)).toMatchObject({ app: 'tiemtra-web', role: 'fe' })
  })

  it('sets the folder of a site and the project of a stack', () => {
    const [site] = suggestionsFor('path', discoveredOn(records), [], 'h')
    expect(applySuggestion(newPart('nginx', 'h'), site!)).toMatchObject({
      path: '/var/www/tiemtra',
    })
    const [stack] = suggestionsFor('compose', discoveredOn(records), [], 'h')
    expect(applySuggestion(newPart('compose', 'h'), stack!)).toMatchObject({
      project: 'tiemtra-api',
    })
  })
})

describe('partState', () => {
  it('reads a pm2 app and a stack from the finds, and nothing else', () => {
    expect(partState(web, records)).toEqual({
      code: 'pm2',
      online: true,
      status: 'online',
      instances: 2,
    })
    const api: DraftPart = {
      key: 'p',
      role: 'be',
      host: 'h',
      kind: 'compose',
      project: 'tiemtra-api',
    }
    expect(partState(api, records)).toEqual({ code: 'compose', running: 4, total: 4 })
    expect(partState({ ...web, app: 'unknown' }, records)).toBeNull()
    expect(partState(newPart('folder', 'h'), records)).toBeNull()
    expect(partState(newPart('database', 'h'), records)).toBeNull()
  })
})

describe('blank parts and paths', () => {
  it('leaves out parts with nothing typed and keeps the rest', () => {
    const draft: DraftProject = {
      key: 'd',
      id: 'x',
      name: 'x',
      color: null,
      urls: [],
      envFiles: [],
      isNew: true,
      origin: '',
      idFollowsName: true,
      parts: [web, newPart('folder', 'h'), newPart('database', 'h')],
    }
    expect(savable(draft).parts).toEqual([web])
    expect(isBlank(web)).toBe(false)
    expect(isBlank(newPart('compose', 'h'))).toBe(true)
  })

  it('flags a typed path that is not absolute, for folders and for .env files', () => {
    expect(badPath({ ...newPart('folder', 'h'), kind: 'path', path: 'var/www' } as DraftPart)).toBe(
      true,
    )
    expect(
      badPath({ ...newPart('folder', 'h'), kind: 'path', path: '/var/www' } as DraftPart),
    ).toBe(false)
    expect(badPath(newPart('folder', 'h'))).toBe(false)
    const db = newPart('database', 'h')
    expect(badPath({ ...db, envFile: '.env' } as DraftPart)).toBe(true)
    expect(badPath({ ...db, envFile: '/srv/.env' } as DraftPart)).toBe(false)
    expect(badPath(web)).toBe(false)
  })
})
