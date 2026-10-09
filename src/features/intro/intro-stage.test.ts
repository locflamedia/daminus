// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import IntroStage from './IntroStage.vue'
import type { IntroScene } from './scene'

const SCENE: IntroScene = {
  hosts: ['a', 'b'],
  issues: { crit: 1, warn: 2, disk: 0 },
  dunes: [],
  stars: [],
}

function stage(extra: Record<string, unknown> = {}) {
  return mount(IntroStage, {
    props: { journey: 'first', scene: SCENE, reducedMotion: true, ...extra },
    global: { plugins: [i18n] },
  })
}

describe('IntroStage with reduced motion', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('emits done after one second and animates nothing', () => {
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame')
    const wrapper = stage()
    vi.advanceTimersByTime(999)
    expect(wrapper.emitted('done')).toBeUndefined()
    vi.advanceTimersByTime(1)
    expect(wrapper.emitted('done')).toHaveLength(1)
    expect(raf).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does not emit done once unmounted', () => {
    const wrapper = stage()
    wrapper.unmount()
    vi.advanceTimersByTime(2000)
    expect(wrapper.emitted('done')).toBeUndefined()
  })

  it('stays put when frozen', () => {
    const wrapper = stage({ freezeAt: 2 })
    vi.advanceTimersByTime(5000)
    expect(wrapper.emitted('done')).toBeUndefined()
    wrapper.unmount()
  })

  it('carries the stage and its two canvases', () => {
    const wrapper = stage()
    const canvases = wrapper.findAll('canvas')
    expect(canvases.map((c) => [c.attributes('width'), c.attributes('height')])).toEqual([
      ['1344', '760'],
      ['2688', '1520'],
    ])
    wrapper.unmount()
  })
})
