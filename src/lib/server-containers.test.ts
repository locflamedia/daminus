import { describe, expect, it } from 'vitest'
import { item } from '@/testing/item-fixture'
import { buildContainers } from './server-containers'

function compose(project: string, services: object[], owner: string | null = project) {
  return item({
    check: 'docker.compose',
    target: project,
    owner: owner ? { kind: 'project', id: owner } : undefined,
    data: { services } as never,
  })
}
const svc = (name: string, over: object = {}) => ({
  name,
  svc: name,
  state: 'running',
  restarts: 0,
  mem: 1000,
  limit: 0,
  cpu: 1.5,
  oom: false,
  exit: 0,
  started: '',
  image: 'x',
  ...over,
})

describe('buildContainers', () => {
  it('lists the containers of every compose project on the host and counts the running ones', () => {
    const items = [
      compose('tiemtra', [svc('tiemtra-api-1'), svc('tiemtra-db-1', { state: 'exited' })]),
      compose('booking', [svc('booking-app-1')]),
    ]
    const result = buildContainers(items, [])
    expect(result.rows.map((r) => r.name)).toEqual([
      'booking-app-1',
      'tiemtra-api-1',
      'tiemtra-db-1',
    ])
    expect(result).toMatchObject({ projects: 2, running: 2 })
    expect(result.rows[0]).toMatchObject({ compose: 'booking', owner: 'booking' })
  })

  it('turns a container amber when its restarts grew since the baseline', () => {
    const now = [compose('tiemtra', [svc('w', { restarts: 3 }), svc('a', { restarts: 2 })])]
    const before = [compose('tiemtra', [svc('w', { restarts: 0 }), svc('a', { restarts: 2 })])]
    const rows = buildContainers(now, before).rows
    expect(rows.find((r) => r.name === 'w')).toMatchObject({ grew: 3, tone: 'warn' })
    expect(rows.find((r) => r.name === 'a')).toMatchObject({ grew: 0, tone: 'ok' })
  })

  it('has no growth figure for a container the baseline did not have', () => {
    const now = [compose('tiemtra', [svc('new', { restarts: 4 })])]
    expect(buildContainers(now, []).rows[0]).toMatchObject({ grew: null, tone: 'ok' })
  })

  it('marks a stopped container critical when it was killed or exited with an error', () => {
    const now = [
      compose('p', [
        svc('oom', { state: 'exited', oom: true }),
        svc('bad', { state: 'exited', exit: 1 }),
        svc('quiet', { state: 'exited', exit: 0 }),
      ]),
    ]
    const tones = Object.fromEntries(buildContainers(now, []).rows.map((r) => [r.name, r.tone]))
    expect(tones).toEqual({ oom: 'crit', bad: 'crit', quiet: 'idle' })
  })

  it('has no owner for a compose project no Daminus project owns', () => {
    expect(buildContainers([compose('x', [svc('a')], null)], []).rows[0]?.owner).toBeNull()
  })
})
