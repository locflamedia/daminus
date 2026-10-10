import { describe, expect, it } from 'vitest'
import { server } from '@/testing/report-fixture'
import { factSeries, item } from '@/testing/item-fixture'
import {
  coresOf,
  failedOutcome,
  hostItems,
  hostSeries,
  hostState,
  osOf,
  uptimeOf,
} from './server-facts'

describe('hostState', () => {
  it('tells a host the report does not know from one left out of the scan', () => {
    expect(hostState(undefined)).toBe('missing')
    expect(hostState(server('a', { included: false }))).toBe('not-scanned')
    expect(hostState(server('a', { outcome: null }))).toBe('not-scanned')
  })

  it('separates a host that did not answer from one that did, partly or fully', () => {
    const down = server('a', { outcome: { state: 'unreachable', cause: 'refused' } })
    expect(hostState(down)).toBe('unreachable')
    expect(failedOutcome(down)).toEqual({ state: 'unreachable', cause: 'refused' })
    expect(hostState(server('a', { outcome: { state: 'partial' } }))).toBe('normal')
    expect(failedOutcome(server('a'))).toBeNull()
  })
})

describe('hostItems', () => {
  it('keeps the results measured on the host whoever owns them', () => {
    const list = [
      item({ host: 'a', check: 'sys.load', owner: { kind: 'project', id: 'p' } }),
      item({ host: 'a', check: 'sys.mem' }),
      item({ host: 'b', check: 'sys.mem' }),
    ]
    expect(hostItems({ items: list } as never, 'a')).toHaveLength(2)
    expect(hostItems(null, 'a')).toEqual([])
  })
})

describe('osOf and uptimeOf', () => {
  it('read the distribution and the seconds since boot of sys.load', () => {
    const items = [
      item({ check: 'sys.load', data: { cores: 4, uptime: 3542817, os: 'Ubuntu 24.04' } }),
    ]
    expect(osOf(items)).toBe('Ubuntu 24.04')
    expect(uptimeOf(items)).toBe(3542817)
  })

  it('are null when an older scan did not read them', () => {
    const items = [item({ check: 'sys.load', data: { cores: 4 } })]
    expect(osOf(items)).toBeNull()
    expect(uptimeOf(items)).toBeNull()
  })
})

describe('coresOf', () => {
  it('reads the cores from the load result and ignores nonsense', () => {
    expect(coresOf([item({ check: 'sys.load', data: { cores: 4 } })])).toBe(4)
    expect(coresOf([item({ check: 'sys.load', data: { cores: 0 } })])).toBeNull()
    expect(coresOf([])).toBeNull()
  })
})

describe('hostSeries', () => {
  it('reads a value or a data field of one target, oldest first', () => {
    const facts = [
      ...factSeries('a', 'disk.fs', [1, 2], { target: '/', field: 'pct' }),
      ...factSeries('a', 'disk.fs', [9, 9], { target: '/x', field: 'pct' }),
    ]
    expect(hostSeries(facts, 'a', 'disk.fs', 'data.pct', '/').map((p) => p.value)).toEqual([1, 2])
    expect(
      hostSeries(factSeries('a', 'sys.load', [1.5]), 'a', 'sys.load').map((p) => p.value),
    ).toEqual([1.5])
  })
})
