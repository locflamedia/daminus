import { describe, expect, it } from 'vitest'
import { revealSshFailure } from './reveal-ssh'

const err = (path: string) => ({ code: { kind: 'io', path }, retryable: false })

describe('revealSshFailure', () => {
  it('says missing when the folder is not there', () => {
    expect(revealSshFailure(err('~/.ssh'))).toBe('missing')
  })
  it('says failed when opening it failed or the error is something else', () => {
    expect(revealSshFailure(err('/Users/me/.ssh'))).toBe('failed')
    expect(revealSshFailure({ code: { kind: 'internal' }, retryable: false })).toBe('failed')
    expect(revealSshFailure(new Error('x'))).toBe('failed')
  })
})
