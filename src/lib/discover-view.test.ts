import { describe, expect, it } from 'vitest'
import { SAMPLE_RECORDS, sampleProposal } from '@/testing/setup-fixture'
import {
  countsOf,
  findColumns,
  foundIn,
  incompleteRows,
  laneDetails,
  laneState,
  listeningLeft,
  pairsOf,
  projectOf,
  proxyTarget,
  readingFraction,
  readingSource,
  siteName,
  type HostRecords,
} from './discover-view'

const sample = (host: string) => SAMPLE_RECORDS[host] ?? []
const all: HostRecords[] = Object.keys(SAMPLE_RECORDS).map((host) => ({
  host,
  records: sample(host),
}))
const proposal = sampleProposal(Object.keys(SAMPLE_RECORDS))

describe('counts', () => {
  it('counts every kind, a zero stays a zero', () => {
    expect(countsOf(sample('vps-sg-2'))).toEqual({
      sites: 3,
      compose: 2,
      pm2: 0,
      databases: 1,
      env: 3,
      ports: 1,
    })
  })

  it('found is what makes up projects', () => {
    expect(foundIn(sample('vps-sg-2'))).toBe(6)
    expect(foundIn(sample('db-main'))).toBe(1)
  })
})

describe('laneState', () => {
  const reached = { outcome: { state: 'reached' } as const }

  it('is queued until the host starts, then running', () => {
    expect(laneState(undefined, undefined, [])).toBe('queued')
    expect(laneState({ state: 'queued' }, undefined, [])).toBe('queued')
    expect(laneState({ state: 'connecting' }, undefined, [])).toBe('running')
    expect(laneState({ state: 'running' }, undefined, sample('db-main'))).toBe('running')
  })

  it('is done when everything was read and incomplete when a source was not', () => {
    expect(laneState(undefined, reached, sample('vps-sg-2'))).toBe('done')
    expect(laneState(undefined, reached, sample('vps-hn-3'))).toBe('incomplete')
  })

  it('marks a stopped or unreachable host apart from an incomplete one', () => {
    expect(laneState(undefined, { outcome: { state: 'timeout' } }, [])).toBe('timeout')
    expect(laneState(undefined, { outcome: { state: 'auth_failed' } }, [])).toBe('unreachable')
    expect(laneState(undefined, { outcome: { state: 'partial' } }, [])).toBe('incomplete')
  })
})

describe('readingSource', () => {
  it('names the source after the last record, in the order discover reads them', () => {
    expect(readingSource([])).toBe('nginx')
    expect(readingSource(sample('db-main').slice(0, 1))).toBe('ports')
    const [site, app] = [sample('vps-sg-2')[0], sample('vps-hn-3')[1]]
    expect(readingSource(site ? [site] : [])).toBe('containers')
    expect(readingSource(app ? [app] : [])).toBe('databases')
    expect(readingSource([{ rec: 'note', code: 'docker_no_permission' }])).toBe('pm2')
  })
})

describe('readingFraction', () => {
  it('grows with the sources read and stays under one', () => {
    expect(readingFraction('nginx')).toBe(0)
    expect(readingFraction('env')).toBeGreaterThan(readingFraction('pm2'))
    expect(readingFraction('env')).toBeLessThan(1)
  })
})

describe('incompleteRows', () => {
  it('lists one row per unreadable source with the fix that can be stated', () => {
    const rows = incompleteRows(sample('vps-hn-3'), 'deploy')
    expect(rows.map((r) => r.code)).toEqual([
      'pm2_home',
      'docker_no_permission',
      'nginx_no_permission',
    ])
    expect(rows[0]).toMatchObject({ user: 'node', home: null, login: 'deploy', command: null })
    expect(rows[1]?.command).toBe('sudo usermod -aG docker deploy')
    expect(rows[2]?.command).toBeNull()
  })

  it('has no docker command without a login user, or with one that is unsafe', () => {
    expect(incompleteRows(sample('vps-hn-3'), null)[1]?.command).toBeNull()
    expect(incompleteRows(sample('vps-hn-3'), 'a; rm -rf /')[1]?.command).toBeNull()
  })

  it('suggests starting docker when it is stopped, and says nothing for pm2 missing', () => {
    const rows = incompleteRows(
      [
        { rec: 'note', code: 'docker_stopped' },
        { rec: 'note', code: 'pm2_missing' },
        { rec: 'note', code: 'pm2_missing' },
      ],
      'deploy',
    )
    expect(rows.map((r) => r.command)).toEqual(['sudo systemctl start docker', null])
  })

  it('uses the folder when the pm2 home has no user in it', () => {
    const rows = incompleteRows([{ rec: 'pm2_home', home: '/root/.pm2', state: 'needs_perm' }], 'x')
    expect(rows[0]).toMatchObject({ user: null, home: '/root/.pm2' })
  })

  it('shows nothing for a host that is only missing pm2 or docker as programs it does not have', () => {
    expect(incompleteRows(sample('vps-sg-2'), 'deploy')).toEqual([])
  })
})

describe('laneDetails', () => {
  it('keeps the dropped lines and the .env files that cannot be read', () => {
    expect(laneDetails(sample('vps-hn-3'), 2)).toEqual({
      dropped: 2,
      unreadable: ['/var/www/kho-hang/legacy/.env'],
    })
  })
})

describe('projects', () => {
  it('matches a site by its address, a container by project, an app by name', () => {
    const site = sample('vps-sg-1')[0]
    const app = sample('vps-sg-1')[1]
    const box = sample('vps-sg-2')[3]
    expect(site && projectOf(proposal, 'vps-sg-1', site)).toEqual({
      id: 'tiemtra',
      name: 'tiemtra',
    })
    expect(app && projectOf(proposal, 'vps-sg-1', app)).toEqual({ id: 'tiemtra', name: 'tiemtra' })
    expect(box && projectOf(proposal, 'vps-sg-2', box)).toEqual({ id: 'tiemtra', name: 'tiemtra' })
  })

  it('says unassigned when the grouping left it out, nothing before it ran', () => {
    const metabase = sample('vps-sg-1')[2]
    expect(metabase && projectOf(proposal, 'vps-sg-1', metabase)).toBe('unassigned')
    expect(metabase && projectOf(null, 'vps-sg-1', metabase)).toBeNull()
  })

  it('matches a database container by its name and a process by its engine', () => {
    const container = sample('vps-sg-2').find((r) => r.rec === 'db')
    const process = sample('db-main')[0]
    expect(container && projectOf(proposal, 'vps-sg-2', container)).toMatchObject({ id: 'tiemtra' })
    expect(process && projectOf(proposal, 'db-main', process)).toMatchObject({ id: 'booking' })
  })

  it('names a site by its first public name, not www and not a catch-all', () => {
    expect(siteName({ names: ['_', 'www.shop.vn', 'shop.vn'], file: 'a' })).toBe('shop.vn')
    expect(siteName({ names: ['_'], root: '/var/www/x', file: 'a' })).toBe('_')
    expect(siteName({ names: [], root: '/var/www/x', file: 'a' })).toBe('/var/www/x')
  })
})

describe('findColumns', () => {
  it('puts each kind in its column and counts the databases with a .env', () => {
    const cols = findColumns(all, proposal)
    expect(cols.sites.map((f) => f.title)).toEqual([
      'tiemtra.vn',
      'api.tiemtra.vn',
      'booking.vn',
      'admin.booking.vn',
      'khohang.vn',
      'shop.old.example',
    ])
    expect(cols.apps.map((f) => f.title)).toEqual(['tiemtra-web', 'kho-hang-admin'])
    expect(cols.boxes.map((f) => f.title)).toEqual(['metabase', 'tiemtra-api', 'booking'])
    expect(cols.dbs.map((f) => f.title)).toEqual(['PostgreSQL', 'MySQL', 'MySQL'])
    expect(cols.dbEnv).toBe(2)
  })

  it('gives every find a key that does not change when more arrive', () => {
    const before = findColumns(all.slice(0, 1), proposal).sites.map((f) => f.key)
    const after = findColumns(all, proposal).sites.map((f) => f.key)
    expect(after).toEqual(expect.arrayContaining(before))
  })

  it('knows the engine port a database host listens on', () => {
    const cols = findColumns(all, proposal)
    expect(cols.dbs.find((f) => f.host === 'db-main')?.port).toBe(3306)
    expect(cols.dbs.find((f) => f.host === 'vps-sg-2')?.port).toBeNull()
  })
})

describe('proxyTarget', () => {
  it('writes a local port short and keeps another host whole', () => {
    expect(proxyTarget('127.0.0.1:3000')).toBe(':3000')
    expect(proxyTarget('localhost:8000')).toBe(':8000')
    expect(proxyTarget('app.internal:9000')).toBe('app.internal:9000')
  })
})

describe('listeningLeft', () => {
  it('keeps the ports nothing accounts for and flags a public database port', () => {
    const left = listeningLeft(all)
    expect(left.map((l) => `${l.host}:${l.port}`)).toEqual([
      'vps-sg-1:8080',
      'vps-sg-2:9000',
      'db-main:3306',
    ])
    expect(left.find((l) => l.port === 3306)?.publicDb).toBe(true)
    expect(left.find((l) => l.port === 8080)?.publicDb).toBe(false)
  })

  it('drops a port a site proxies to or a pm2 app runs from', () => {
    const records: HostRecords = {
      host: 'h',
      records: [
        {
          rec: 'vhost',
          file: 'f',
          names: ['a.vn'],
          proxy: '127.0.0.1:3000',
          ssl: true,
          php: false,
          listen: [80, 443],
        },
        { rec: 'port', port: 3000, bind: 'loopback', proc: 'node' },
        { rec: 'port', port: 443, bind: 'any' },
        { rec: 'port', port: 5173, bind: 'loopback', proc: 'node', cwd: '/srv/app' },
        {
          rec: 'pm2',
          app: 'app',
          home: '/h',
          default: true,
          instances: 1,
          status: 'online',
          cwd: '/srv/app',
        },
      ],
    }
    expect(listeningLeft([records])).toEqual([])
  })
})

describe('pairsOf', () => {
  it('pairs a front end and a back end that run on other hosts', () => {
    const pairs = pairsOf(proposal, all)
    expect(pairs.map((p) => p.project)).toContain('tiemtra')
    const t = pairs.find((p) => p.project === 'tiemtra')
    expect(t).toMatchObject({ apart: true, fe: { host: 'vps-sg-1' }, be: { host: 'vps-sg-2' } })
  })

  it('pairs a front end on a port with a back end that has none, on the same host', () => {
    const k = pairsOf(proposal, all).find((p) => p.project === 'kho-hang')
    expect(k).toMatchObject({ apart: false, fe: { port: 5173 }, be: { port: null } })
  })

  it('has none before the grouping ran', () => {
    expect(pairsOf(null, all)).toEqual([])
  })
})
