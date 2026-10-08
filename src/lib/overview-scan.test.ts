import { describe, expect, it } from 'vitest'
import type { HostProgress, Project, ScanRun } from '@/api'
import { cardScan, chipOf, scanCounts, scanHosts, serverScan, urlChecks } from './overview-scan'

const idle = { facts: 0, dropped: 0 }
const queued: HostProgress = { ...idle, state: 'queued' }
const running: HostProgress = { ...idle, state: 'running' }
const reached: HostProgress = { ...idle, state: 'finished', outcome: { state: 'reached' } }
const timedOut: HostProgress = { ...idle, state: 'finished', outcome: { state: 'timeout' } }

function run(hosts: Record<string, HostProgress>): ScanRun {
  return { scan_id: 's', started_at: '2026-09-26T06:00:00Z', next_seq: 0, hosts }
}

const project = (hosts: string[], db?: string): Project => ({
  id: 'p',
  name: 'p',
  urls: [],
  components: [
    ...hosts.map((host) => ({ role: 'be' as const, host, kind: 'path' as const, path: '/srv' })),
    ...(db
      ? [
          {
            role: 'db' as const,
            host: db,
            kind: 'db' as const,
            engine: 'mysql' as const,
            database: 'x',
            env_file: '/e',
          },
        ]
      : []),
  ],
})

describe('host chips', () => {
  it('gives each host one of four words, and a timeout is failed', () => {
    expect(chipOf(queued)).toBe('queued')
    expect(chipOf(running)).toBe('reading')
    expect(chipOf({ ...idle, state: 'connecting' })).toBe('reading')
    expect(chipOf(reached)).toBe('done')
    expect(chipOf({ ...idle, state: 'finished', outcome: { state: 'partial' } })).toBe('done')
    expect(chipOf(timedOut)).toBe('failed')
  })

  it('leaves the URL checks out of the hosts and reports them apart', () => {
    const r = run({ '@local': reached, a: running, b: queued })
    expect(scanHosts(r).map((h) => h.host)).toEqual(['a', 'b'])
    expect(urlChecks(r)).toBe('done')
    expect(urlChecks(run({ a: running }))).toBeNull()
    expect(urlChecks(null)).toBeNull()
  })

  it('flags a host waiting for the SSH agent and keeps the cause for the tooltip', () => {
    const r = run({ a: { ...idle, state: 'agent_wait' }, b: timedOut })
    expect(scanHosts(r)).toMatchObject([
      { host: 'a', agentWait: true, detail: 'agent_wait' },
      { host: 'b', agentWait: false, detail: 'timeout' },
    ])
  })

  it('counts hosts done and failed', () => {
    const r = run({ '@local': reached, a: reached, b: timedOut, c: running })
    expect(scanCounts(r)).toEqual({ total: 3, done: 1, failed: 1, finished: 2 })
  })
})

describe('cardScan', () => {
  it('waits until a host of the project has finished, then says updating', () => {
    const p = project(['a', 'b'])
    expect(cardScan(p, run({ a: running, b: queued })).phase).toBe('waiting')
    expect(cardScan(p, run({ a: reached, b: running })).phase).toBe('updating')
  })

  it('names the host being read, or the first one waiting for a slot', () => {
    const p = project(['a', 'b'])
    expect(cardScan(p, run({ a: queued, b: running }))).toMatchObject({
      reading: 'b',
      queuedOnly: false,
    })
    expect(cardScan(p, run({ a: queued, b: queued }))).toMatchObject({
      reading: 'a',
      queuedOnly: true,
    })
  })

  it('reads the tiles by where their results come from', () => {
    const p = project(['a'], 'db')
    const r = run({ '@local': running, a: reached, db: running })
    expect(cardScan(p, r)).toMatchObject({ uptime: true, disk: true, db: true })
    const done = run({ '@local': reached, a: reached, db: reached })
    expect(cardScan(p, done)).toMatchObject({ uptime: false, disk: false, db: false })
  })

  it('is idle for a project the scan does not include, and with no scan', () => {
    expect(cardScan(project(['z']), run({ a: running })).phase).toBe('idle')
    expect(cardScan(project(['a']), null).phase).toBe('idle')
  })

  it('still counts a project whose URLs are checked when none of its hosts is in the scan', () => {
    expect(cardScan(project(['z']), run({ '@local': running })).phase).toBe('waiting')
  })
})

describe('serverScan', () => {
  it('is the state of the host in the run, or null when it is not in it', () => {
    const r = run({ a: running })
    expect(serverScan('a', r)).toBe('reading')
    expect(serverScan('b', r)).toBeNull()
    expect(serverScan('a', null)).toBeNull()
  })
})
