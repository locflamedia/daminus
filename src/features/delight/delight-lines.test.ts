import { describe, expect, it } from 'vitest'
import type { ScanRun } from '@/api'
import en from '@/i18n/parts/delight.en.json'
import vi from '@/i18n/parts/delight.vi.json'
import { LINE_GROUPS, lineEntries, pickLine } from './delight-lines'

type Tree = { [key: string]: string | Tree }

function paths(node: Tree, prefix = ''): string[] {
  return Object.entries(node).flatMap(([k, v]) =>
    typeof v === 'string' ? [prefix + k] : paths(v, `${prefix}${k}.`),
  )
}

function run(hosts: ScanRun['hosts']): ScanRun {
  return { scan_id: 'a', started_at: '2026-09-26T13:42:00Z', next_seq: 0, hosts }
}

describe('lineEntries', () => {
  it('names what each host being read is doing', () => {
    const entries = lineEntries(
      run({
        'vps-sg-2': { state: 'running', step: 'system', facts: 3, dropped: 0 },
        'vps-sg-1': { state: 'queued', facts: 0, dropped: 0 },
        'vps-hn-3': { state: 'connecting', facts: 0, dropped: 0 },
        db: { state: 'agent_wait', facts: 0, dropped: 0 },
      }),
      [],
    )
    expect(entries).toEqual([
      { host: 'vps-sg-2', group: 'disk' },
      { host: 'vps-hn-3', group: 'connect' },
    ])
  })

  it('skips a group that is switched off', () => {
    const entries = lineEntries(
      run({ h: { state: 'running', step: 'system', facts: 1, dropped: 0 } }),
      ['disk'],
    )
    expect(entries).toEqual([{ host: 'h', group: 'containers' }])
  })

  it('has nothing for no run', () => {
    expect(lineEntries(null, [])).toEqual([])
  })
})

describe('pickLine', () => {
  const entries = [
    { host: 'a', group: 'disk' as const },
    { host: 'b', group: 'security' as const },
  ]

  it('takes the hosts in turn, then the second wording', () => {
    expect(pickLine(entries, 0, false).key).toBe('delight.lines.byGroup.disk.a')
    expect(pickLine(entries, 1, false).key).toBe('delight.lines.byGroup.security.a')
    expect(pickLine(entries, 2, false).key).toBe('delight.lines.byGroup.disk.b')
    expect(pickLine(entries, 4, false).key).toBe('delight.lines.byGroup.disk.a')
    expect(pickLine(entries, 1, false).params.host).toBe('b')
  })

  it('states the facts when something is critical', () => {
    expect(pickLine(entries, 0, true)).toEqual({
      key: 'delight.lines.plain',
      params: { host: 'a' },
    })
  })

  it('falls back to a plain line when nothing is known', () => {
    expect(pickLine([], 3, false).key).toBe('delight.lines.plainAll')
    expect(pickLine([{ host: '', group: 'uptime' }], 0, true).key).toBe('delight.lines.plainAll')
  })
})

describe('messages', () => {
  it('ship in English and Vietnamese together', () => {
    expect(paths(vi as Tree).sort()).toEqual(paths(en as Tree).sort())
  })

  it('have both wordings for every group', () => {
    const lines = (en as { delight: { lines: { byGroup: Tree } } }).delight.lines.byGroup
    for (const g of LINE_GROUPS) {
      expect(Object.keys(lines[g] as Tree).sort()).toEqual(['a', 'b'])
    }
  })
})
