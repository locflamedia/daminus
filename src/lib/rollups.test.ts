import { describe, expect, it } from 'vitest'
import type { Item } from '@/api'
import { counts, diskItem, project, server } from '@/testing/report-fixture'
import {
  diskPercent,
  diskTone,
  isUnreachable,
  issueCount,
  sortProjects,
  sortServers,
  tabLevels,
} from './rollups'

describe('issueCount', () => {
  it('counts critical and warnings only', () => {
    expect(issueCount({ counts: counts({ crit: 2, warn: 1, expected: 4, unknown: 3 }) })).toBe(3)
  })
})

describe('sorting', () => {
  it('orders projects critical, warning, healthy, unreachable, then by name', () => {
    const sorted = sortProjects([
      project('zeta'),
      project('lost', { unreachable_hosts: ['db'] }),
      project('beta', { level: 'warn', counts: counts({ warn: 1 }) }),
      project('alpha'),
      project('kho', { level: 'crit', counts: counts({ crit: 2 }) }),
      project('alpha-warn', { level: 'warn', counts: counts({ warn: 2 }) }),
    ])
    expect(sorted.map((p) => p.id)).toEqual(['kho', 'alpha-warn', 'beta', 'alpha', 'zeta', 'lost'])
  })

  it('keeps a project with a critical issue first even when a host is unreachable', () => {
    const sorted = sortProjects([
      project('quiet'),
      project('both', { level: 'crit', unreachable_hosts: ['db'] }),
    ])
    expect(sorted[0]?.id).toBe('both')
  })

  it('sorts servers the same way and does not change its input', () => {
    const input = [
      server('vps-b', { outcome: { state: 'unreachable', cause: 'dns' } }),
      server('vps-a', { level: 'warn' }),
      server('vps-c'),
    ]
    expect(sortServers(input).map((s) => s.host)).toEqual(['vps-a', 'vps-c', 'vps-b'])
    expect(input.map((s) => s.host)).toEqual(['vps-b', 'vps-a', 'vps-c'])
  })
})

describe('isUnreachable', () => {
  it('is true for outcomes where the host did not answer', () => {
    expect(isUnreachable({ state: 'reached' })).toBe(false)
    expect(isUnreachable({ state: 'partial' })).toBe(false)
    expect(isUnreachable(null)).toBe(false)
    expect(isUnreachable({ state: 'timeout' })).toBe(true)
    expect(isUnreachable({ state: 'auth_failed' })).toBe(true)
    expect(isUnreachable({ state: 'host_key_changed', fp: 'x' })).toBe(true)
  })
})

describe('diskPercent', () => {
  it('takes the fullest filesystem of the host', () => {
    const items = [
      diskItem('vps-a', 40, '/'),
      diskItem('vps-a', 87, '/data'),
      diskItem('vps-b', 99),
    ]
    expect(diskPercent(items, 'vps-a')).toBe(87)
    expect(diskPercent(items, 'vps-c')).toBeNull()
  })

  it('ignores results without a number', () => {
    const item = diskItem('vps-a', 10)
    item.fact = { check: 'disk.fs', target: '/', unknown: 'needs_perm' }
    expect(diskPercent([item], 'vps-a')).toBeNull()
  })
})

describe('diskTone', () => {
  it('turns warning at 80 and critical at 90', () => {
    expect(diskTone(79.9)).toBe('normal')
    expect(diskTone(80)).toBe('warn')
    expect(diskTone(89)).toBe('warn')
    expect(diskTone(90)).toBe('crit')
  })
})

describe('tabLevels', () => {
  const owned = (
    group: Item['group'],
    level: 'warn' | 'crit' | 'ok',
    disposition: Item['disposition'] = { kind: 'active' },
  ): Item => ({
    key: { host: 'vps-a', check: 'x.y', target: group },
    group,
    owner: { kind: 'project', id: 'tiemtra' },
    severity: { level },
    disposition,
  })

  it('gives a tab its worst open level', () => {
    const items = [owned('disk', 'warn'), owned('disk', 'crit'), owned('containers', 'warn')]
    expect(tabLevels(items, 'tiemtra')).toEqual({ disk: 'crit', containers: 'warn' })
  })

  it('ignores healthy, expected, stale and other projects', () => {
    const items = [
      owned('security', 'ok'),
      owned('databases', 'crit', { kind: 'expected', rule: 'r1' }),
      owned('disk', 'crit', { kind: 'stale', since_seq: 3 }),
      owned('system', 'crit'),
    ]
    expect(tabLevels(items, 'tiemtra')).toEqual({})
    expect(tabLevels([owned('disk', 'crit')], 'other')).toEqual({})
  })
})
