import { describe, expect, it } from 'vitest'
import type { Item, ScanFact } from '@/api'
import {
  imageChangedAt,
  logsCommand,
  parseCompose,
  parsePm2,
  peak,
  raisedLimit,
  troubledService,
  uptimeMs,
} from './project-containers'

const svc = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  svc: name.split('-')[1],
  state: 'running',
  restarts: 0,
  mem: 100,
  limit: 200,
  cpu: 1,
  oom: false,
  exit: 0,
  started: '2026-09-20T00:00:00Z',
  image: 'app:1',
  ...extra,
})

const compose = (services: unknown[]): Item =>
  ({
    key: { host: 'h', check: 'docker.compose', target: 'p' },
    fact: {
      check: 'docker.compose',
      target: 'p',
      data: {
        containers: services.length,
        running: services.length,
        not_running: 0,
        restarts: 0,
        services,
      },
    },
  }) as unknown as Item

describe('compose reading', () => {
  it('reads services with memory against the limit and no limit as null', () => {
    const v = parseCompose(compose([svc('p-api-1'), svc('p-db-1', { limit: 0 })]))
    expect(v?.services[0]?.memPct).toBe(50)
    expect(v?.services[1]?.limit).toBeNull()
    expect(v?.services[1]?.memPct).toBeNull()
  })

  it('has no view for a result that could not answer', () => {
    const item = {
      ...compose([]),
      fact: { check: 'docker.compose', target: 'p', unknown: 'needs_perm' },
    } as unknown as Item
    expect(parseCompose(item)).toBeNull()
  })

  it('names the killed service before a restarted one', () => {
    const v = parseCompose(
      compose([
        svc('p-a-1', { restarts: 5 }),
        svc('p-b-1', { oom: true, restarts: 1 }),
        svc('p-c-1'),
      ]),
    )
    expect(troubledService(v?.services ?? [])?.name).toBe('p-b-1')
  })

  it('names nothing when every service is calm', () => {
    expect(troubledService(parseCompose(compose([svc('p-a-1')]))?.services ?? [])).toBeNull()
  })

  it('counts uptime only for a running service', () => {
    const [a, b] =
      parseCompose(compose([svc('p-a-1'), svc('p-b-1', { state: 'exited' })]))?.services ?? []
    expect(uptimeMs(a!, Date.parse('2026-09-21T00:00:00Z'))).toBe(86_400_000)
    expect(uptimeMs(b!, Date.now())).toBeNull()
  })
})

describe('commands', () => {
  it('builds the logs command for plain names', () => {
    expect(logsCommand('vps-sg-2', 'tiemtra-api-worker-1')).toBe(
      'ssh vps-sg-2 "docker logs --tail 20 tiemtra-api-worker-1"',
    )
  })

  it('refuses a name that could carry shell syntax', () => {
    expect(logsCommand('vps', 'x; rm -rf /')).toBeNull()
    expect(logsCommand('-oProxyCommand=x', 'x')).toBeNull()
  })
})

describe('image history', () => {
  const fact = (seq: number, image: string): ScanFact =>
    ({
      seq,
      host: 'h',
      at: '',
      fact: { check: 'docker.compose', target: 'p', data: { services: [svc('p-a-1', { image })] } },
    }) as unknown as ScanFact

  it('finds the scan the current image first ran in', () => {
    expect(imageChangedAt([fact(1, 'a'), fact(2, 'a'), fact(3, 'b'), fact(4, 'b')], 'h', 'p')).toBe(
      3,
    )
  })

  it('says nothing when the image never changed', () => {
    expect(imageChangedAt([fact(1, 'a'), fact(2, 'a')], 'h', 'p')).toBeNull()
  })
})

describe('pm2 and peaks', () => {
  it('reads a pm2 app', () => {
    const item = {
      key: { host: 'h', check: 'pm2.app', target: 'a' },
      fact: {
        check: 'pm2.app',
        target: 'a',
        data: { status: 'online', restarts: 3, mem_mb: 62, instances: 2 },
      },
    } as unknown as Item
    expect(parsePm2(item)).toMatchObject({ status: 'online', restarts: 3, memMb: 62, instances: 2 })
  })

  it('takes the highest value of a series', () => {
    expect(peak([{ value: 1 }, { value: 9 }, { value: 4 }])).toBe(9)
    expect(peak([])).toBeNull()
  })
})

describe('raising a memory limit', () => {
  const MIB = 1024 * 1024
  it('names 1.5 times the limit when the free memory of the host holds the rise', () => {
    const host = { used: 5900 * MIB, total: 7800 * MIB }
    expect(raisedLimit(512 * MIB, host)).toBe(768 * MIB)
  })

  it('says nothing when the rise does not fit, or the limit or the host totals are unknown', () => {
    expect(raisedLimit(512 * MIB, { used: 7700 * MIB, total: 7800 * MIB })).toBeNull()
    expect(raisedLimit(null, { used: 1, total: 2 })).toBeNull()
    expect(raisedLimit(512 * MIB, null)).toBeNull()
  })
})
