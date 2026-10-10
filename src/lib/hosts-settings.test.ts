import { describe, expect, it } from 'vitest'
import { failedChip, formatSeconds, shortFingerprint } from './hosts-settings'

describe('formatSeconds', () => {
  it('writes seconds with one decimal', () => {
    expect(formatSeconds(380, 'en')).toBe('0.4 s')
    expect(formatSeconds(486, 'en')).toBe('0.5 s')
  })
})

describe('shortFingerprint', () => {
  it('keeps the algorithm and both ends of the digest', () => {
    expect(shortFingerprint('ED25519 SHA256:q3VfAbCdEfGhIjKlMnOp9kXw')).toBe(
      'ED25519 SHA256:q3Vf…9kXw',
    )
  })

  it('leaves a short digest as it is', () => {
    expect(shortFingerprint('SHA256:abc')).toBe('SHA256:abc')
  })
})

describe('failedChip', () => {
  it('names the cause of the latest scan, not Unreachable for every failure', () => {
    expect(failedChip({ state: 'auth_failed' })).toBe('key_rejected')
    expect(failedChip({ state: 'host_key_changed', fp: 'x' })).toBe('host_key_changed')
    expect(failedChip({ state: 'timeout' })).toBe('timed_out')
    expect(failedChip({ state: 'not_in_config' })).toBe('unreachable')
    expect(failedChip({ state: 'unreachable', cause: 'refused' })).toBe('unreachable')
    expect(failedChip(null)).toBe('unreachable')
  })
})
