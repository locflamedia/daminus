import { describe, expect, it } from 'vitest'
import type { Item, Report } from '@/api'
import { item } from '@/testing/item-fixture'
import { report } from '@/testing/report-fixture'
import { inFilter, tally } from './scan-history-tally'

const issue = (check: string, over: Partial<Item> = {}): Item => ({
  ...item({ check, target: '/', level: { level: 'warn' }, owner: { kind: 'project', id: 'p' } }),
  ...over,
})
const ok = (check: string): Item =>
  item({ check, target: '/', owner: { kind: 'project', id: 'p' } })
const scan = (seq: number, items: Item[]): Report => report({ seq, items })

describe('tally', () => {
  it('is empty without reports', () => {
    expect(tally([], null)).toBeNull()
  })

  it('counts what was fixed, what is open and how long the oldest has been open', () => {
    const reports = [
      scan(1, [issue('disk.fs'), issue('sys.mem')]),
      scan(2, [issue('disk.fs'), ok('sys.mem'), issue('sec.ports')]),
      scan(3, [issue('disk.fs'), ok('sys.mem'), issue('sec.ports')]),
    ]
    expect(tally(reports, null)).toEqual({
      since: 1,
      fixed: 1,
      expected: 0,
      open: 2,
      oldestOpen: 3,
    })
  })

  it('does not call a check that disappeared fixed', () => {
    const reports = [scan(1, [issue('disk.fs')]), scan(2, [])]
    expect(tally(reports, null)).toMatchObject({ fixed: 0, open: 0, oldestOpen: null })
  })

  it('does not call a result that went stale fixed, and starts the count again when it returns', () => {
    const stale = { disposition: { kind: 'stale', since_seq: 1 } } as const
    const reports = [
      scan(1, [issue('disk.fs')]),
      scan(2, [issue('disk.fs', { ...stale })]),
      scan(3, [issue('disk.fs')]),
    ]
    expect(tally(reports, null)).toMatchObject({ fixed: 0, open: 1, oldestOpen: 1 })
  })

  it('counts an issue that comes back after being fixed as fixed once and open again', () => {
    const reports = [scan(1, [issue('a')]), scan(2, [ok('a')]), scan(3, [issue('a')])]
    expect(tally(reports, null)).toMatchObject({ fixed: 1, open: 1, oldestOpen: 1 })
  })

  it('counts the issues marked as expected in the newest scan', () => {
    const marked = issue('sec.ports', { disposition: { kind: 'expected', rule: 'r' } })
    expect(tally([scan(1, [marked])], null)).toMatchObject({ expected: 1, open: 0 })
  })

  it('narrows to a project', () => {
    const other = issue('x', { owner: { kind: 'project', id: 'q' } })
    const reports = [scan(1, [issue('a'), other]), scan(2, [issue('a'), other])]
    expect(tally(reports, 'q')).toMatchObject({ open: 1 })
    expect(inFilter(issue('a'), 'q')).toBe(false)
    expect(inFilter(item({ check: 'a' }), 'p')).toBe(false)
    expect(inFilter(item({ check: 'a' }), null)).toBe(true)
  })
})
