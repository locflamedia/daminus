import { describe, expect, it } from 'vitest'
import { placeBox } from './anchor'

const viewport = { width: 1000, height: 800 }
const anchor = { left: 100, top: 100, width: 80, height: 32 }
const box = { width: 200, height: 120 }

describe('placeBox', () => {
  it('puts the box under the trigger, left edges aligned, with the gap', () => {
    const p = placeBox(anchor, box, viewport)
    expect(p).toMatchObject({ left: 100, top: 138, side: 'bottom' })
  })

  it('aligns to the end and to the centre', () => {
    expect(placeBox(anchor, box, viewport, { placement: 'bottom-end' }).left).toBe(-20 + 28)
    expect(placeBox(anchor, box, viewport, { placement: 'bottom-center' }).left).toBe(40)
  })

  it('flips to the top when there is no room below and more above', () => {
    const low = { left: 100, top: 700, width: 80, height: 32 }
    const p = placeBox(low, box, viewport)
    expect(p.side).toBe('top')
    expect(p.top).toBe(700 - 6 - 120)
  })

  it('keeps the preferred side when the other has even less room', () => {
    const tiny = { width: 400, height: 150 }
    const p = placeBox({ left: 10, top: 60, width: 40, height: 30 }, box, tiny)
    expect(p.side).toBe('bottom')
  })

  it('stays inside the window on both horizontal edges', () => {
    expect(placeBox({ ...anchor, left: 950 }, box, viewport).left).toBe(1000 - 200 - 8)
    expect(placeBox({ ...anchor, left: 0 }, box, viewport, { placement: 'bottom-end' }).left).toBe(
      8,
    )
  })

  it('grows from the trigger: origin follows its centre and the side', () => {
    const p = placeBox(anchor, box, viewport, { placement: 'bottom-center' })
    expect(p.origin).toBe('100px 0')
    expect(p.arrowLeft).toBe(100)
    const mid = { ...anchor, top: 400 }
    const top = placeBox(mid, box, viewport, { placement: 'top-center' })
    expect(top).toMatchObject({ side: 'top', origin: '100px 100%' })
  })
})
