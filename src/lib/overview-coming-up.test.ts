import { describe, expect, it } from 'vitest'
import type { ExpectedRule, Report, ScanFact } from '@/api'
import timeline from '@/testing/fixtures/results.json'
import type { ResultsBundle } from '@/testing/results-bundle'
import {
  certificateExpiries,
  comingUp,
  diskForecasts,
  quietHosts,
  ruleReviews,
  UPCOMING_SHOWN,
} from './overview-coming-up'

const bundle = timeline as unknown as ResultsBundle
const latest = bundle.reports['12'] as Report
const NOW = Date.parse(latest.scanned_at ?? '') + 60_000
const DAY = 86_400_000

function diskFact(host: string, daysAgo: number, pct: number, target = '/'): ScanFact {
  return {
    seq: 1,
    at: new Date(NOW - daysAgo * DAY).toISOString(),
    host,
    fact: { check: 'disk.fs', target, data: { pct, ipct: 1 } },
  }
}

describe('diskForecasts', () => {
  it('counts the days until the straight line reaches 90 percent', () => {
    const facts = [diskFact('vps-a', 4, 70), diskFact('vps-a', 2, 76), diskFact('vps-a', 0, 82)]
    expect(diskForecasts(facts)).toMatchObject([{ subject: 'vps-a', days: 3, tone: 'warn' }])
  })

  it('leaves out a disk that is not rising, is full already, or is far away', () => {
    expect(diskForecasts([diskFact('a', 2, 80), diskFact('a', 0, 78)])).toEqual([])
    expect(diskForecasts([diskFact('a', 2, 88), diskFact('a', 0, 91)])).toEqual([])
    expect(diskForecasts([diskFact('a', 30, 10), diskFact('a', 0, 11)])).toEqual([])
  })

  it('keeps the soonest filesystem of a host and the soonest host first', () => {
    const facts = [
      diskFact('a', 2, 60, '/'),
      diskFact('a', 0, 70, '/'),
      diskFact('a', 2, 60, '/data'),
      diskFact('a', 0, 80, '/data'),
      diskFact('b', 2, 80),
      diskFact('b', 0, 85),
    ]
    expect(diskForecasts(facts).map((r) => [r.subject, r.days])).toEqual([
      ['a', 1],
      ['b', 2],
    ])
  })

  it('ignores facts of other checks and facts without a number', () => {
    const other: ScanFact = { ...diskFact('a', 0, 50), fact: { check: 'sys.mem', target: '' } }
    expect(diskForecasts([other])).toEqual([])
  })
})

describe('ruleReviews', () => {
  const rule = (until: string, id = 'r1'): ExpectedRule => ({
    id,
    host: 'db-main',
    check: 'sec.ports',
    target: '0.0.0.0:6379',
    reason: 'intended',
    until,
  })

  it('lists a review within a month, named by the project that owns the result', () => {
    const item = latest.items.find((i) => i.disposition.kind === 'expected')
    if (item?.disposition.kind !== 'expected') throw new Error('no expected item')
    const rows = ruleReviews([rule('2026-09-29', item.disposition.rule)], latest, NOW)
    expect(rows).toMatchObject([{ kind: 'review', days: 3, subject: 'booking' }])
  })

  it('falls back to the host and skips far, undated and already due rules', () => {
    expect(ruleReviews([rule('2026-09-29')], latest, NOW)[0]?.subject).toBe('db-main')
    expect(ruleReviews([rule('2027-09-29')], latest, NOW)).toEqual([])
    expect(ruleReviews([{ ...rule('2026-09-29'), until: null }], latest, NOW)).toEqual([])
    expect(ruleReviews([rule('2026-09-20')], { ...latest, rules_due: ['r1'] }, NOW)).toEqual([])
  })
})

describe('quietHosts', () => {
  it('lists a host that did not answer, with the days since it did', () => {
    expect(quietHosts(latest, NOW)).toMatchObject([{ subject: 'legacy-shop', days: 7 }])
  })
})

describe('certificateExpiries', () => {
  it('lists the one that expires first when none is close', () => {
    expect(certificateExpiries(latest)).toMatchObject([{ subject: 'khohang.vn', days: 49 }])
  })

  it('lists every certificate inside a month and warns under three weeks', () => {
    const items = latest.items.map((i) =>
      i.key.check === 'url.tls' && i.fact
        ? { ...i, fact: { ...i.fact, value: i.key.target.includes('tiemtra.vn') ? 12 : 25 } }
        : i,
    )
    const rows = certificateExpiries({ ...latest, items })
    expect(rows.length).toBe(4)
    expect(rows[0]).toMatchObject({ days: 12, tone: 'warn' })
    expect(rows.at(-1)).toMatchObject({ days: 25, tone: 'neutral' })
  })

  it('skips expired, untrusted and unchecked certificates', () => {
    const items = latest.items.map((i) =>
      i.key.check === 'url.tls' && i.fact ? { ...i, fact: { ...i.fact, value: -2 } } : i,
    )
    expect(certificateExpiries({ ...latest, items })).toEqual([])
  })
})

describe('comingUp', () => {
  it('orders disk, reviews, quiet hosts, then certificates, and stops at six', () => {
    const facts = [diskFact('vps-sg-2', 4, 70), diskFact('vps-sg-2', 0, 82)]
    const rows = comingUp(latest, bundle.rules, facts, NOW)
    expect(rows.map((r) => r.kind)).toEqual(['disk', 'review', 'quiet', 'tls'])
    expect(rows.length).toBeLessThanOrEqual(UPCOMING_SHOWN)
  })
})
