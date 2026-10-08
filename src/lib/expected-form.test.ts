import { describe, expect, it } from 'vitest'
import type { Item } from '@/api'
import {
  MAX_NOTE,
  markLevel,
  needsDate,
  reviewDay,
  settle,
  startForm,
  toDraft,
} from './expected-form'

function item(check: string, level: 'ok' | 'warn' | 'crit', expected = false): Item {
  return {
    key: { host: 'vps-sg-2', check, target: '/srv/uploads/index.php' },
    group: 'security',
    owner: { kind: 'server', host: 'vps-sg-2' },
    severity: { level },
    disposition: expected ? { kind: 'expected', rule: 'r1' } : { kind: 'active' },
  } as Item
}

describe('markLevel', () => {
  it('offers a warning and a critical result', () => {
    expect(markLevel(item('sec.ports', 'warn'))).toBe('warn')
    expect(markLevel(item('sec.upload_php', 'crit'))).toBe('crit')
  })

  it('offers nothing for a result that is fine, already expected, or exposed files', () => {
    expect(markLevel(item('sec.ports', 'ok'))).toBeNull()
    expect(markLevel(item('sec.upload_php', 'crit', true))).toBeNull()
    expect(markLevel(item('url.exposed', 'crit'))).toBeNull()
  })
})

describe('the form rules', () => {
  it('starts as the board does: meant to be there, as it is now, 30 days', () => {
    expect(startForm()).toEqual({
      reason: 'intended',
      covers: 'as_it_is',
      review: '30',
      note: '',
    })
  })

  it('needs a date for a critical result and for an accepted risk only', () => {
    expect(needsDate('crit', 'intended')).toBe(true)
    expect(needsDate('warn', 'accepted_risk')).toBe(true)
    expect(needsDate('warn', 'intended')).toBe(false)
  })

  it('turns Never into 30 days when a date is needed, and binds a critical result to its evidence', () => {
    const wide = { ...startForm(), covers: 'any_evidence' as const, review: 'never' as const }
    expect(settle(wide, 'crit')).toMatchObject({ covers: 'as_it_is', review: '30' })
    expect(settle(wide, 'warn')).toMatchObject({ covers: 'any_evidence', review: 'never' })
    expect(settle({ ...wide, reason: 'accepted_risk' }, 'warn').review).toBe('30')
  })

  it('cuts the note at the limit', () => {
    const long = { ...startForm(), note: 'x'.repeat(MAX_NOTE + 40) }
    expect(settle(long, 'warn').note).toHaveLength(MAX_NOTE)
  })

  it('computes the review day in UTC', () => {
    const now = new Date('2026-09-26T23:30:00Z')
    expect(reviewDay(now, '30')?.toISOString().slice(0, 10)).toBe('2026-10-26')
    expect(reviewDay(now, '90')?.toISOString().slice(0, 10)).toBe('2026-12-25')
    expect(reviewDay(now, 'never')).toBeNull()
  })

  it('builds the draft Rust expects', () => {
    const it1 = item('sec.upload_php', 'crit')
    const draft = toDraft(it1.key, { ...startForm(), note: '  silence file ' }, 'crit')
    expect(draft).toEqual({
      host: 'vps-sg-2',
      check: 'sec.upload_php',
      target: '/srv/uploads/index.php',
      reason: 'intended',
      covers: 'as_it_is',
      review_days: 30,
      note: 'silence file',
    })
  })
})
