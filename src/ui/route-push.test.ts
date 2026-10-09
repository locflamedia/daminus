// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createInputTracker, playPush, pushDirection } from './route-push'

describe('pushDirection', () => {
  it('pushes when a detail opens and pops when it closes', () => {
    expect(pushDirection('overview', 'project')).toBe('push')
    expect(pushDirection('history', 'server')).toBe('push')
    expect(pushDirection('project', 'server')).toBe('push')
    expect(pushDirection('project', 'overview')).toBe('pop')
    expect(pushDirection('server', 'settings')).toBe('pop')
  })

  it('stays still between tabs of one detail, between top-level screens and on first load', () => {
    expect(pushDirection('project', 'project')).toBeNull()
    expect(pushDirection('overview', 'history')).toBeNull()
    expect(pushDirection(undefined, 'project')).toBeNull()
  })
})

describe('createInputTracker', () => {
  let stop: (() => void) | undefined
  afterEach(() => stop?.())

  it('remembers whether the last input was the pointer or the keyboard', () => {
    const tracker = createInputTracker(window)
    stop = tracker.stop
    expect(tracker.last()).toBeNull()
    window.dispatchEvent(new Event('pointerdown'))
    expect(tracker.last()).toBe('pointer')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(tracker.last()).toBe('keyboard')
  })

  it('stops listening once stopped', () => {
    const tracker = createInputTracker(window)
    tracker.stop()
    window.dispatchEvent(new Event('pointerdown'))
    expect(tracker.last()).toBeNull()
  })
})

describe('playPush', () => {
  function main() {
    const el = document.createElement('main')
    const decor = document.createElement('span')
    decor.setAttribute('aria-hidden', 'true')
    el.append(decor, document.createElement('header'), document.createElement('section'))
    return el
  }

  it('slides the view in from the right on push and from the left on pop, never the decor', () => {
    const el = main()
    const calls: { tag: string; frames: Keyframe[]; options: KeyframeAnimationOptions }[] = []
    for (const child of Array.from(el.children)) {
      ;(child as HTMLElement).animate = vi.fn((frames, options) => {
        calls.push({
          tag: child.tagName,
          frames: frames as Keyframe[],
          options: options as KeyframeAnimationOptions,
        })
        return {} as Animation
      })
    }
    const vars = { '--dur-push': '220ms', '--push-shift': '12px', '--ease-out': 'ease-out' }
    playPush(el, 'push', (name) => vars[name as keyof typeof vars] ?? '')
    expect(calls.map((c) => c.tag)).toEqual(['HEADER', 'SECTION'])
    expect(calls[0]?.frames[0]).toEqual({ opacity: 0, transform: 'translateX(12px)' })
    expect(calls[0]?.frames[1]).toEqual({ opacity: 1, transform: 'none' })
    expect(calls[0]?.options).toEqual({ duration: 220, easing: 'ease-out' })

    calls.length = 0
    playPush(el, 'pop', (name) => vars[name as keyof typeof vars] ?? '')
    expect(calls[0]?.frames[0]).toEqual({ opacity: 0, transform: 'translateX(-12px)' })
  })

  it('does nothing where the duration is zero or animation is missing', () => {
    const el = main()
    const header = el.querySelector('header') as HTMLElement
    header.animate = vi.fn()
    playPush(el, 'push', (name) => (name === '--dur-push' ? '0ms' : '12px'))
    expect(header.animate).not.toHaveBeenCalled()
    expect(() => playPush(main(), 'push', () => '220ms')).not.toThrow()
  })
})
