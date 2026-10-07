import { describe, expect, it } from 'vitest'
import { stepCursor } from './chart-cursor'

describe('stepCursor', () => {
  it('lands on the newest point with the first arrow and then steps one at a time', () => {
    expect(stepCursor('ArrowLeft', null, 5)).toEqual({ next: 4, handled: true })
    expect(stepCursor('ArrowRight', null, 5)).toEqual({ next: 4, handled: true })
    expect(stepCursor('ArrowLeft', 3, 5).next).toBe(2)
    expect(stepCursor('ArrowRight', 3, 5).next).toBe(4)
  })

  it('stops at the ends instead of wrapping', () => {
    expect(stepCursor('ArrowLeft', 0, 5).next).toBe(0)
    expect(stepCursor('ArrowRight', 4, 5).next).toBe(4)
  })

  it('jumps to the first and last with Home and End', () => {
    expect(stepCursor('Home', 3, 5).next).toBe(0)
    expect(stepCursor('End', 1, 5).next).toBe(4)
  })

  it('closes the card with Escape, but only while one is open', () => {
    expect(stepCursor('Escape', 2, 5)).toEqual({ next: null, handled: true })
    expect(stepCursor('Escape', null, 5)).toEqual({ next: null, handled: false })
  })

  it('leaves other keys and empty charts alone', () => {
    expect(stepCursor('a', 2, 5)).toEqual({ next: 2, handled: false })
    expect(stepCursor('ArrowLeft', null, 0)).toEqual({ next: null, handled: false })
  })
})
