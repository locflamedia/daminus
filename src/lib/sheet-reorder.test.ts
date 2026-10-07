import { describe, expect, it } from 'vitest'
import { canMove, dropIndex, moveBy, moveItem } from './sheet-reorder'

describe('moveItem', () => {
  it('moves an item to another index without touching the list', () => {
    const list = ['a', 'b', 'c', 'd']
    expect(moveItem(list, 3, 0)).toEqual(['d', 'a', 'b', 'c'])
    expect(moveItem(list, 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(list).toEqual(['a', 'b', 'c', 'd'])
  })

  it('clamps the target and ignores an index outside the list', () => {
    expect(moveItem(['a', 'b'], 0, 9)).toEqual(['b', 'a'])
    expect(moveItem(['a', 'b'], 5, 0)).toEqual(['a', 'b'])
  })
})

describe('moveBy and canMove', () => {
  it('moves one place and stays put at the ends', () => {
    expect(moveBy(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c'])
    expect(moveBy(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c'])
    expect(canMove(3, 0, -1)).toBe(false)
    expect(canMove(3, 2, 1)).toBe(false)
    expect(canMove(3, 1, 1)).toBe(true)
  })
})

describe('dropIndex', () => {
  it('is the row whose middle is the first below the pointer', () => {
    const middles = [22, 66, 110, 154]
    expect(dropIndex(middles, -5)).toBe(0)
    expect(dropIndex(middles, 40)).toBe(1)
    expect(dropIndex(middles, 120)).toBe(3)
    expect(dropIndex(middles, 900)).toBe(3)
    expect(dropIndex([], 10)).toBe(0)
  })
})
