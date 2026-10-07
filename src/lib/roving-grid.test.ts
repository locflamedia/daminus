import { describe, expect, it } from 'vitest'
import { moveInGrid } from './roving-grid'

describe('moveInGrid', () => {
  it('walks a row with left and right and stops at the ends', () => {
    expect(moveInGrid('ArrowRight', { row: 0, col: 2 }, 1, 5)).toEqual({ row: 0, col: 3 })
    expect(moveInGrid('ArrowLeft', { row: 0, col: 2 }, 1, 5)).toEqual({ row: 0, col: 1 })
    expect(moveInGrid('ArrowLeft', { row: 0, col: 0 }, 1, 5)).toBeNull()
    expect(moveInGrid('ArrowRight', { row: 0, col: 4 }, 1, 5)).toBeNull()
  })

  it('walks rows with up and down', () => {
    expect(moveInGrid('ArrowDown', { row: 0, col: 3 }, 3, 5)).toEqual({ row: 1, col: 3 })
    expect(moveInGrid('ArrowUp', { row: 0, col: 3 }, 3, 5)).toBeNull()
    expect(moveInGrid('ArrowDown', { row: 2, col: 3 }, 3, 5)).toBeNull()
  })

  it('goes to the ends of the row with Home and End, and of the grid with Control', () => {
    expect(moveInGrid('Home', { row: 1, col: 3 }, 3, 5)).toEqual({ row: 1, col: 0 })
    expect(moveInGrid('End', { row: 1, col: 3 }, 3, 5)).toEqual({ row: 1, col: 4 })
    expect(moveInGrid('Home', { row: 1, col: 3 }, 3, 5, true)).toEqual({ row: 0, col: 0 })
    expect(moveInGrid('End', { row: 1, col: 3 }, 3, 5, true)).toEqual({ row: 2, col: 4 })
  })

  it('ignores other keys and empty grids', () => {
    expect(moveInGrid('a', { row: 0, col: 0 }, 1, 5)).toBeNull()
    expect(moveInGrid('ArrowRight', { row: 0, col: 0 }, 0, 0)).toBeNull()
  })
})
