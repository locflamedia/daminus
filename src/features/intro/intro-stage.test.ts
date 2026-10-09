// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { recordingContext } from './fake-canvas'
import IntroStage from './IntroStage.vue'
import type { IntroScene } from './scene'

vi.mock('./starry', () => ({ loadStarry: async () => ({}) }))
vi.mock('./dom', () => ({
  canvasMask: () => new Uint8Array(),
  ensureFont: async () => undefined,
  loadLogo: async () => null,
}))
vi.mock('./stations', () => ({ buildLayout: () => ({}) }))
vi.mock('./backdrop', () => ({ createGrain: () => ({}) }))
const renderAt = vi.fn()
vi.mock('./engine', () => ({
  createIntroEngine: () => ({ duration: 8, renderAt, overlaysAt: () => [] }),
}))

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
    renderAt.mockClear()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => recordingContext() as unknown as CanvasRenderingContext2D,
    )
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('holds the still for one second after it is drawn and animates nothing', async () => {
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame')
    const wrapper = stage()
    await vi.advanceTimersByTimeAsync(0)
    expect(renderAt).toHaveBeenCalledTimes(1)
    expect(renderAt).toHaveBeenCalledWith(8)
    vi.advanceTimersByTime(999)
    expect(wrapper.emitted('done')).toBeUndefined()
    vi.advanceTimersByTime(1)
    expect(wrapper.emitted('done')).toHaveLength(1)
    expect(raf).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does not emit done once unmounted', async () => {
    const wrapper = stage()
    await vi.advanceTimersByTimeAsync(0)
    wrapper.unmount()
    vi.advanceTimersByTime(2000)
    expect(wrapper.emitted('done')).toBeUndefined()
  })

  it('stays put when frozen', async () => {
    const wrapper = stage({ freezeAt: 2 })
    await vi.advanceTimersByTimeAsync(5000)
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

  it('counts every host and server in the pills while the painting draws five', () => {
    const hosts = Array.from({ length: 12 }, (_, i) => `h${i}`)
    const stars = hosts.map((name) => ({ name, issue: null, level: 'ok' as const }))
    const wrapper = stage({ scene: { ...SCENE, hosts, stars } })
    const pills = wrapper.findAll('.pill').map((p) => p.text())
    expect(pills[0]).toContain('Your 12 servers')
    expect(pills[1]).toContain('12 hosts found')
    wrapper.unmount()
  })

  it('shrinks its canvases when it goes', async () => {
    const wrapper = stage()
    await vi.advanceTimersByTimeAsync(0)
    const canvases = wrapper.findAll('canvas').map((c) => c.element)
    wrapper.unmount()
    expect(canvases.map((c) => [c.width, c.height])).toEqual([
      [0, 0],
      [0, 0],
    ])
  })
})

describe('IntroStage animating', () => {
  let frames: FrameRequestCallback[] = []
  beforeEach(() => {
    frames = []
    renderAt.mockReset()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => recordingContext() as unknown as CanvasRenderingContext2D,
    )
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => frames.push(cb))
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('ends the journey and reports when a frame throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const wrapper = stage({ reducedMotion: false })
    await vi.waitFor(() => expect(frames).toHaveLength(1))
    renderAt.mockImplementation(() => {
      throw new Error('draw failed')
    })
    frames[0]?.(0)
    expect(error).toHaveBeenCalled()
    expect(wrapper.emitted('done')).toHaveLength(1)
    wrapper.unmount()
  })

  it('cancels the pending frame before it schedules another when shown again', async () => {
    const wrapper = stage({ reducedMotion: false })
    await vi.waitFor(() => expect(frames).toHaveLength(1))
    const cancel = vi.mocked(globalThis.cancelAnimationFrame)
    cancel.mockClear()
    document.dispatchEvent(new Event('visibilitychange'))
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(frames).toHaveLength(2)
    wrapper.unmount()
  })
})
