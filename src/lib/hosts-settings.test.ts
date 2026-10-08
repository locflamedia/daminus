import { describe, expect, it } from 'vitest'
import { formatSeconds, shortFingerprint } from './hosts-settings'

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
