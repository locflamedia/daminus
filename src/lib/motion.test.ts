// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { playOnce, prefersReducedMotion, resetPlayed, staggerDelay, vDraw, vEnter } from './motion'

beforeEach(() => resetPlayed())
afterEach(() => vi.restoreAllMocks())

function mounted<T extends HTMLElement | SVGElement>(el: T, value: unknown, directive: unknown): T {
  const hook = (directive as { mounted: (el: T, binding: { value: unknown }) => void }).mounted
  hook(el, { value })
  return el
}

describe('staggerDelay', () => {
  it('steps 80 ms per item', () => {
    expect(staggerDelay(0)).toBe('0ms')
    expect(staggerDelay(3)).toBe('240ms')
    expect(staggerDelay(2, 40)).toBe('80ms')
    expect(staggerDelay(-1)).toBe('0ms')
  })
})

describe('playOnce', () => {
  it('is true the first time a key is seen and false after, per key', () => {
    expect(playOnce('cpu')).toBe(true)
    expect(playOnce('cpu')).toBe(false)
    expect(playOnce('disk')).toBe(true)
    resetPlayed()
    expect(playOnce('cpu')).toBe(true)
  })
})

describe('v-enter', () => {
  it('adds the arrival class with a stagger delay', () => {
    const el = mounted(document.createElement('div'), { index: 2 }, vEnter)
    expect(el.classList.contains('m-enter')).toBe(true)
    expect(el.style.getPropertyValue('--d')).toBe('160ms')
  })

  it('uses the reveal motion for a value that lands', () => {
    const el = mounted(document.createElement('div'), { kind: 'reveal' }, vEnter)
    expect(el.classList.contains('m-reveal')).toBe(true)
  })

  it('plays only the first time a keyed element appears', () => {
    const first = mounted(document.createElement('div'), { once: 'card-1' }, vEnter)
    const again = mounted(document.createElement('div'), { once: 'card-1' }, vEnter)
    expect(first.classList.contains('m-enter')).toBe(true)
    expect(again.classList.contains('m-enter')).toBe(false)
  })
})

describe('v-draw', () => {
  it('normalises the path length and marks it for drawing, once per key', () => {
    const path = () => document.createElementNS('http://www.w3.org/2000/svg', 'path')
    const first = mounted(path(), { once: 'spark' }, vDraw)
    expect(first.getAttribute('pathLength')).toBe('1')
    expect(first.classList.contains('m-draw')).toBe(true)
    const second = mounted(path(), { once: 'spark' }, vDraw)
    expect(second.classList.contains('m-draw')).toBe(false)
  })
})

describe('prefersReducedMotion', () => {
  it('reads the OS setting', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
    expect(prefersReducedMotion()).toBe(true)
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
    expect(prefersReducedMotion()).toBe(false)
  })
})
