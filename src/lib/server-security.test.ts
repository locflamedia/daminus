import { describe, expect, it } from 'vitest'
import { report } from '@/testing/report-fixture'
import { item } from '@/testing/item-fixture'
import { buildFindings, buildSecurityLite, SECURITY_CHECKS } from './server-security'

describe('buildFindings', () => {
  it('lists only what is not ok, worst first, and counts the rest', () => {
    const items = [
      item({ check: 'disk.fs', target: '/', level: { level: 'warn' } }),
      item({ check: 'sec.ports', target: '0.0.0.0:3306', level: { level: 'crit' } }),
      item({ check: 'docker.df', level: { level: 'info' } }),
      item({ check: 'sys.load', level: { level: 'unknown', reason: 'timeout' } }),
      item({ check: 'sys.mem' }),
      item({ check: 'sys.swap' }),
      item({
        check: 'sec.upload_php',
        level: { level: 'crit' },
        disposition: { kind: 'expected', rule: 'r1' },
      }),
    ]
    const { rows, tally } = buildFindings(items)
    expect(rows.map((r) => r.item.key.check)).toEqual([
      'sec.ports',
      'disk.fs',
      'sys.load',
      'docker.df',
    ])
    expect(tally).toEqual({ crit: 1, warn: 1, info: 1, unknown: 1, expected: 1, ok: 2 })
  })

  it('says since which scan a kept result was last checked', () => {
    const old = item({
      check: 'disk.fs',
      level: { level: 'warn' },
      disposition: { kind: 'stale', since_seq: 7 },
    })
    expect(buildFindings([old]).rows[0]?.staleSince).toBe(7)
  })
})

describe('buildSecurityLite', () => {
  const clean = SECURITY_CHECKS.map((check) => item({ check, value: 0, unit: 'count' }))

  it('has the six checks in the board order and counts the clean ones', () => {
    const lite = buildSecurityLite(clean, report())
    expect(lite.rows.map((r) => r.check)).toEqual([...SECURITY_CHECKS])
    expect(lite).toMatchObject({ clean: 6, counted: 6 })
  })

  it('shows recent code changes as information with the number of files', () => {
    const changed = clean.map((i) =>
      i.key.check === 'sec.recent_change'
        ? item({
            check: 'sec.recent_change',
            target: '/srv/app',
            level: { level: 'info' },
            value: 12,
            unit: 'files',
          })
        : i,
    )
    const lite = buildSecurityLite(changed, report())
    expect(lite.rows[5]).toMatchObject({ state: 'info', detail: { kind: 'files', n: 12 } })
    expect(lite.clean).toBe(5)
  })

  it('says how far the miner check got when it could not see every process', () => {
    const partial = clean.map((i) =>
      i.key.check === 'sec.miner'
        ? item({
            check: 'sec.miner',
            level: { level: 'unknown', reason: 'needs_perm' },
            data: { seen: 41, total: 212 },
          })
        : i,
    )
    expect(buildSecurityLite(partial, report()).rows[0]).toMatchObject({
      state: 'unknown',
      detail: { kind: 'seen', seen: 41, total: 212 },
    })
  })

  it('keeps a miner found with partial coverage as a finding that says what was seen', () => {
    const found = clean.map((i) =>
      i.key.check === 'sec.miner'
        ? item({
            check: 'sec.miner',
            target: 'xmrig',
            level: { level: 'crit' },
            data: { seen: 41, total: 212 },
          })
        : i,
    )
    expect(buildSecurityLite(found, report()).rows[0]).toMatchObject({
      state: 'crit',
      detail: { kind: 'seen', seen: 41, total: 212, name: 'xmrig' },
    })
  })

  it('writes off a check whose group is switched off in Settings and does not count it', () => {
    const lite = buildSecurityLite(clean, report({ disabled_groups: ['code_changes'] }))
    expect(lite.rows[5]).toMatchObject({ state: 'off', detail: { kind: 'off' } })
    expect(lite).toMatchObject({ clean: 5, counted: 5 })
  })

  it('shows a check the host has no result for as missing, not clean', () => {
    const lite = buildSecurityLite(clean.slice(1), report())
    expect(lite.rows[0]?.state).toBe('none')
    expect(lite.counted).toBe(5)
  })

  it('counts findings per check and treats an expected result as not there', () => {
    const items = [
      item({ check: 'sec.ports', target: ':3306', level: { level: 'warn' } }),
      item({
        check: 'sec.ports',
        target: ':6379',
        level: { level: 'warn' },
        disposition: { kind: 'expected', rule: 'x' },
      }),
    ]
    expect(buildSecurityLite(items, report()).rows[3]).toMatchObject({
      state: 'warn',
      detail: { kind: 'found', n: 1 },
    })
  })
})
