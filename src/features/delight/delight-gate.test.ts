import { describe, expect, it } from 'vitest'
import { devDelight, shouldChime, shouldPlay, shouldShow } from './delight-gate'

const on = { setting: true, hasCritical: false, reduceMotion: false }

describe('shouldPlay', () => {
  it('plays only with the switch on, nothing critical and motion allowed', () => {
    expect(shouldPlay(on)).toBe(true)
    expect(shouldPlay({ ...on, setting: false })).toBe(false)
    expect(shouldPlay({ ...on, hasCritical: true })).toBe(false)
    expect(shouldPlay({ ...on, reduceMotion: true })).toBe(false)
  })

  it('covers the whole matrix', () => {
    for (const setting of [true, false])
      for (const hasCritical of [true, false])
        for (const reduceMotion of [true, false]) {
          expect(shouldPlay({ setting, hasCritical, reduceMotion })).toBe(
            setting && !hasCritical && !reduceMotion,
          )
        }
  })
})

describe('shouldShow and shouldChime', () => {
  it('ignore Reduce Motion but keep the switch and the critical rule', () => {
    expect(shouldShow({ setting: true, hasCritical: false })).toBe(true)
    expect(shouldShow({ setting: false, hasCritical: false })).toBe(false)
    expect(shouldShow({ setting: true, hasCritical: true })).toBe(false)
    expect(shouldChime({ setting: true, hasCritical: false })).toBe(true)
    expect(shouldChime({ setting: true, hasCritical: true })).toBe(false)
  })
})

describe('devDelight', () => {
  it('reads the switch only in development', () => {
    expect(devDelight('?mock&delight=sky', true)).toEqual({ kind: 'sky', hold: false })
    expect(devDelight('?delight=lines&delightHold=1', true)).toEqual({ kind: 'lines', hold: true })
    expect(devDelight('?delight=sky', false).kind).toBeNull()
    expect(devDelight('?delight=nope', true).kind).toBeNull()
  })
})
