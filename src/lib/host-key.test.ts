import { describe, expect, it } from 'vitest'
import type { HostKeyInfo } from '@/api'
import {
  connectCommand,
  faceOf,
  fingerprintParts,
  fingerprintText,
  forgetCommand,
  identicon,
  infoFromOutcome,
  keyProblemOf,
  retryResult,
} from './host-key'

const OFFERED = 'ED25519 SHA256:Lm7rC1pQe9Vx3Ns0Kd8Tg2Yh5Bw6Fj4Zu7Ha1Mo2Pa'
const info = (state: HostKeyInfo['state'], offered: string | null, known: string[] = []) =>
  ({ state, offered, known }) as HostKeyInfo

describe('faceOf', () => {
  it('shows the first-connection face for an unknown key with a fingerprint', () => {
    expect(faceOf(info('unknown', OFFERED))).toBe('unknown')
  })

  it('shows the changed face whether or not the offered key could be read', () => {
    expect(faceOf(info('changed', OFFERED, ['ED25519 SHA256:old']))).toBe('changed')
    expect(faceOf(info('changed', null, ['ED25519 SHA256:old']))).toBe('changed')
  })

  it('never guesses: no fingerprint, or no answer, is the unavailable face', () => {
    expect(faceOf(info('unknown', null))).toBe('unavailable')
    expect(faceOf(null)).toBe('unavailable')
  })

  it('has no face once the key is known', () => {
    expect(faceOf(info('known', OFFERED, [OFFERED]))).toBeNull()
  })
})

describe('retryResult', () => {
  it('says accepted, still unknown, or changed since you looked', () => {
    expect(retryResult('unknown', info('known', OFFERED, [OFFERED]))).toBe('accepted')
    expect(retryResult('unknown', info('unknown', OFFERED))).toBe('still_unknown')
    expect(retryResult('unknown', info('changed', OFFERED, ['x']))).toBe('changed')
    expect(retryResult('unavailable', info('changed', OFFERED, ['x']))).toBe('changed')
  })

  it('has nothing to say when the lookup fails, or a changed key stays changed', () => {
    expect(retryResult('unknown', null)).toBeNull()
    expect(retryResult('changed', info('changed', OFFERED, ['x']))).toBeNull()
  })
})

describe('the outcome of a scan', () => {
  it('names the key problem and carries the offered fingerprint', () => {
    const unknown = { state: 'host_key_unknown', fp: OFFERED } as const
    expect(keyProblemOf(unknown)).toBe('unknown')
    expect(infoFromOutcome(unknown)).toEqual({ state: 'unknown', offered: OFFERED, known: [] })
    expect(keyProblemOf({ state: 'timeout' })).toBeNull()
    expect(infoFromOutcome({ state: 'timeout' })).toBeNull()
  })

  it('treats an empty fingerprint as none', () => {
    expect(infoFromOutcome({ state: 'host_key_changed', fp: '' })?.offered).toBeNull()
  })
})

describe('fingerprints', () => {
  it('cuts the digest into groups of four, with the hash name on the first', () => {
    const parts = fingerprintParts(OFFERED)
    expect(parts.algorithm).toBe('ED25519')
    expect(parts.groups.slice(0, 3)).toEqual(['SHA256:Lm7r', 'C1pQ', 'e9Vx'])
    expect(parts.groups.join('')).toBe('SHA256:Lm7rC1pQe9Vx3Ns0Kd8Tg2Yh5Bw6Fj4Zu7Ha1Mo2Pa')
    expect(fingerprintText(OFFERED)).toBe('SHA256:Lm7rC1pQe9Vx3Ns0Kd8Tg2Yh5Bw6Fj4Zu7Ha1Mo2Pa')
  })

  it('keeps text that is not in the usual shape as it is', () => {
    expect(fingerprintParts('weird').groups.join('')).toBe('weird')
  })

  it('makes the same pattern for the same key, mirrored, and another for another key', () => {
    const a = identicon(OFFERED)
    expect(a).toEqual(identicon(OFFERED))
    expect(a).toHaveLength(25)
    for (let r = 0; r < 5; r++) expect(a[r * 5]).toBe(a[r * 5 + 4])
    expect(identicon('ED25519 SHA256:other')).not.toEqual(a)
  })
})

describe('commands', () => {
  it('connects once to accept, and forgets the old key by name', () => {
    expect(connectCommand('db-main')).toBe('ssh db-main')
    expect(forgetCommand('db-main')).toBe('ssh-keygen -R db-main')
    expect(connectCommand("a b'c")).toBe("ssh 'a b'\\''c'")
  })
})
