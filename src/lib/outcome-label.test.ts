import { describe, expect, it } from 'vitest'
import { outcomeKey, outcomeTone } from './outcome-label'

describe('outcomeKey', () => {
  it('names each failure by its cause, not all as unreachable', () => {
    expect(outcomeKey({ state: 'auth_failed' })).toBe('key_refused')
    expect(outcomeKey({ state: 'host_key_changed', fp: 'x' })).toBe('host_key_changed')
    expect(outcomeKey({ state: 'host_key_unknown', fp: 'x' })).toBe('host_key_unknown')
    expect(outcomeKey({ state: 'timeout' })).toBe('timed_out')
    expect(outcomeKey({ state: 'not_in_config' })).toBe('not_in_config')
    expect(outcomeKey({ state: 'unreachable', cause: 'dns' })).toBe('unreachable')
    expect(outcomeKey(null)).toBe('unreachable')
  })

  it('reds what needs the user, and keeps network trouble quiet', () => {
    expect(outcomeTone({ state: 'auth_failed' })).toBe('crit')
    expect(outcomeTone({ state: 'host_key_changed', fp: 'x' })).toBe('crit')
    expect(outcomeTone({ state: 'unreachable', cause: 'refused' })).toBe('quiet')
    expect(outcomeTone({ state: 'timeout' })).toBe('quiet')
  })
})
