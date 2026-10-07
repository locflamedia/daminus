import { describe, expect, it } from 'vitest'
import type { Item } from '@/api'
import { chipParts, tlsState } from './tls-state'

function tls(
  value: number | null,
  data: Record<string, boolean | number | string> = {},
  level: 'ok' | 'warn' | 'crit' | 'unknown' = 'ok',
  unknown?: 'refused',
): Item {
  return {
    key: { host: '@local', check: 'url.tls', target: 'https://shop.test' },
    group: 'uptime',
    owner: { kind: 'project', id: 'shop' },
    severity: level === 'unknown' ? { level, reason: 'unreachable' } : { level },
    disposition: { kind: 'active' },
    fact: {
      check: 'url.tls',
      target: 'https://shop.test',
      value,
      unit: 'days',
      data,
      ...(unknown ? { unknown: 'unreachable' as const } : {}),
    },
  }
}

describe('tlsState', () => {
  it('reads a healthy certificate as ok with its days', () => {
    const s = tlsState(tls(74.2, { not_after: 1_797_000_000 }))
    expect(s).toMatchObject({ tone: 'ok', icon: 'check', days: 74.2, flags: [] })
    expect(chipParts(s)).toEqual({ days: 74, flags: [] })
  })

  it('shows a near end as warn', () => {
    const s = tlsState(tls(12.4, {}, 'warn'))
    expect(s.tone).toBe('warn')
    expect(chipParts(s).days).toBe(12)
  })

  it('keeps the negative days of an expired certificate on the chip', () => {
    const s = tlsState(tls(-5.3, { expired: true }, 'crit'))
    expect(s).toMatchObject({ tone: 'crit', flags: ['expired'] })
    expect(chipParts(s)).toEqual({ days: -5, flags: [] })
  })

  it('puts the days first and joins the flags that follow', () => {
    const s = tlsState(tls(-5, { expired: true, untrusted: true, mismatch: true }, 'crit'))
    expect(s.flags).toEqual(['expired', 'untrusted', 'mismatch'])
    expect(chipParts(s)).toEqual({ days: -5, flags: ['untrusted', 'mismatch'] })
  })

  it('leads with the flag alone when the certificate is only untrusted or for another name', () => {
    expect(chipParts(tlsState(tls(61, { untrusted: true }, 'crit')))).toEqual({
      days: null,
      flags: ['untrusted'],
    })
    expect(chipParts(tlsState(tls(61, { mismatch: true }, 'crit')))).toEqual({
      days: null,
      flags: ['mismatch'],
    })
  })

  it('is idle and never ok when nothing was read, with the reason', () => {
    const s = tlsState(tls(null, { error: 'refused' }, 'unknown', 'refused'))
    expect(s).toMatchObject({ tone: 'idle', days: null, reason: 'refused' })
    expect(tlsState(undefined).tone).toBe('idle')
    expect(tlsState(tls(null, { error: 'weird' }, 'unknown', 'refused')).reason).toBe('other')
  })
})
