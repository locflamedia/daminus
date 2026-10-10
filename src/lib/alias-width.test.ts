import { describe, expect, it } from 'vitest'
import { aliasWidthStyle } from './alias-width'

describe('aliasWidthStyle', () => {
  it('is the longest alias at 7.8 px a character, rounded up', () => {
    expect(aliasWidthStyle(['vps-sg-1', 'apollo-traffic'])).toEqual({ '--alias': '110px' })
  })

  it('is 0 for no alias', () => {
    expect(aliasWidthStyle([])).toEqual({ '--alias': '0px' })
  })
})
