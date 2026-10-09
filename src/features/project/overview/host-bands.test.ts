import { describe, expect, it } from 'vitest'
import type { Project } from '@/api'
import { partRows, wiring } from '@/lib/project-overview'
import { hostBands, wireLinks } from './host-bands'

const project = (components: Project['components']): Project => ({
  id: 'p',
  name: 'p',
  urls: [],
  components,
})

const split = project([
  { role: 'fe', host: 'a', kind: 'path', path: '/srv/web' },
  { role: 'worker', host: 'a', kind: 'pm2', app: 'cron' },
  { role: 'be', host: 'b', kind: 'compose', project: 'api' },
  { role: 'db', host: 'b', kind: 'db', engine: 'postgres', database: 'shop', env_file: '/e' },
])

describe('wiring bands by server', () => {
  it('stacks the front end and a worker of one server in a single band', () => {
    const bands = hostBands(wiring(partRows(split, [])))
    expect(bands.map((b) => [b.host, b.data, b.nodes.map((n) => n.role)])).toEqual([
      ['a', false, ['fe', 'worker']],
      ['b', false, ['be']],
      ['b', true, ['db']],
    ])
  })

  it('keeps a database on a server of its own as a plain band', () => {
    const p = project([
      { role: 'be', host: 'a', kind: 'pm2', app: 'api' },
      { role: 'db', host: 'd', kind: 'db', engine: 'mysql', database: 'shop', env_file: '/e' },
    ])
    const bands = hostBands(wiring(partRows(p, [])))
    expect(bands.map((b) => [b.host, b.data])).toEqual([
      ['a', false],
      ['d', false],
    ])
  })

  it('links each part to the next tier on other bands only', () => {
    const links = wireLinks(hostBands(wiring(partRows(split, []))))
    expect(links.map((l) => `${l.from.role}>${l.to.role}`)).toEqual(['fe>be', 'worker>db', 'be>db'])
  })

  it('does not change the input bands', () => {
    const bands = wiring(partRows(split, []))
    const before = JSON.stringify(bands)
    hostBands(bands)
    expect(JSON.stringify(bands)).toBe(before)
  })
})
