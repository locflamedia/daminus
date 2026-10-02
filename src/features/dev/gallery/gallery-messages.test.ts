import { describe, expect, it } from 'vitest'
import { galleryMessages } from './gallery-messages'

type Tree = { [key: string]: string | Tree }

function keys(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [`${prefix}${key}`] : keys(value, `${prefix}${key}.`),
  )
}

describe('gallery sample copy', () => {
  it('has the same keys in English and Vietnamese', () => {
    expect(keys(galleryMessages.vi).sort()).toEqual(keys(galleryMessages.en).sort())
  })
})
