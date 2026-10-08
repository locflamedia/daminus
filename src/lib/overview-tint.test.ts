import { describe, expect, it } from 'vitest'
import { tintOf } from './overview-tint'

describe('tintOf', () => {
  it('knows the end stop of each tint', () => {
    expect(tintOf('#4F6BED')).toBe('blue')
    expect(tintOf('#1c8f55')).toBe('green')
    expect(tintOf('#5f6478')).toBe('slate')
  })

  it('takes the nearest tint for a colour that is none of them', () => {
    expect(tintOf('#9F86E6')).toBe('lilac')
    expect(tintOf('#E58FB2')).toBe('rose')
  })

  it('is blue without a usable colour', () => {
    expect(tintOf(null)).toBe('blue')
    expect(tintOf('red')).toBe('blue')
  })
})
