import { describe, expect, it } from 'vitest'
import type { Item, Report } from '@/api'
import { item } from '@/testing/item-fixture'
import { report } from '@/testing/report-fixture'
import { compareReports, figuresOf } from './scan-history-compare'
import type { ScanSummary } from '@/api'

const owner = { kind: 'project', id: 'p' } as const
const issue = (check: string, over: Partial<Item> = {}, level: 'warn' | 'crit' = 'warn'): Item => ({
  ...item({ check, target: '/', level: { level }, owner }),
  ...over,
})
const fine = (check: string): Item => item({ check, target: '/', owner })
const scan = (items: Item[]): Report => report({ items })

describe('compareReports', () => {
  it('separates what is new, fixed and unchanged between two scans', () => {
    const older = scan([issue('a'), issue('b'), issue('c')])
    const newer = scan([
      issue('a', { delta: { kind: 'still', scans_open: 3 } }),
      fine('b'),
      issue('d', { delta: { kind: 'new' } }, 'crit'),
    ])
    const result = compareReports(older, newer, null)
    expect(result).toMatchObject({ new: 1, fixed: 1, still: 1 })
    expect(result.rows.map((r) => [r.kind, r.item.key.check, r.scans])).toEqual([
      ['new', 'd', null],
      ['fixed', 'b', null],
      ['still', 'a', 3],
    ])
  })

  it('reads the same two scans the other way round', () => {
    const older = scan([issue('a'), fine('d')])
    const newer = scan([issue('a'), issue('d')])
    expect(compareReports(older, newer, null)).toMatchObject({ new: 1, fixed: 0, still: 1 })
    expect(compareReports(newer, older, null)).toMatchObject({ new: 0, fixed: 1, still: 1 })
  })

  it('does not call a result that is no longer answered, or one marked expected, fixed', () => {
    const older = scan([issue('gone'), issue('marked')])
    const newer = scan([issue('marked', { disposition: { kind: 'expected', rule: 'r' } })])
    expect(compareReports(older, newer, null)).toMatchObject({ new: 0, fixed: 0, still: 0 })
  })

  it('puts critical before warning inside each kind', () => {
    const newer = scan([issue('w'), issue('c', {}, 'crit')])
    expect(compareReports(scan([]), newer, null).rows.map((r) => r.item.key.check)).toEqual([
      'c',
      'w',
    ])
  })

  it('narrows to a project and names the owner of each row', () => {
    const server = item({ check: 'disk.fs', target: '/', level: { level: 'warn' }, host: 'vps-a' })
    const newer = scan([issue('a'), server])
    expect(compareReports(scan([]), newer, 'p').rows.map((r) => r.owner)).toEqual(['p'])
    expect(
      compareReports(scan([]), newer, null)
        .rows.map((r) => r.owner)
        .sort(),
    ).toEqual(['p', 'vps-a'])
  })
})

describe('figuresOf', () => {
  it('gives the hosts reached and the duration of a scan', () => {
    const s = {
      seq: 1,
      started_at: '2026-09-26T06:41:00Z',
      finished_at: '2026-09-26T06:42:02Z',
      hosts: { a: { outcome: { state: 'reached' } } },
    } as unknown as ScanSummary
    expect(figuresOf(s, null)).toEqual({ hosts: { reached: 1, total: 1 }, durationMs: 62_000 })
  })
})
