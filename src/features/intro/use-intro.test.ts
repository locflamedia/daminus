// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, type EffectScope } from 'vue'
import type { LaunchKind } from '@/api'
import { counts, report, server } from '@/testing/report-fixture'
import { FADE_MS, useIntro, type IntroDeps } from './use-intro'

let scope: EffectScope | null = null

function setup(kind: LaunchKind | Error, extra: Partial<IntroDeps> = {}) {
  const launch = vi.fn(() =>
    kind instanceof Error ? Promise.reject(kind) : Promise.resolve({ kind, previous: null }),
  )
  const deps: Partial<IntroDeps> = {
    launch,
    hostAliases: () => Promise.resolve(['a', 'b']),
    mode: () => 'always',
    report: () => Promise.resolve(report({ servers: [server('h1')], counts: counts({ crit: 1 }) })),
    reducedMotion: () => false,
    search: '',
    dev: false,
    ...extra,
  }
  scope = effectScope()
  const intro = scope.run(() => useIntro(deps))!
  return { intro, launch }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.useFakeTimers()
})
afterEach(() => {
  scope?.stop()
  scope = null
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useIntro decisions', () => {
  it('plays the first journey with the config hosts', async () => {
    const { intro, launch } = setup('first')
    await intro.start()
    expect(launch).toHaveBeenCalledTimes(1)
    expect(intro.plan.value?.journey).toBe('first')
    expect(intro.plan.value?.scene.hosts).toEqual(['a', 'b'])
  })

  it('plays nohosts when the config has none', async () => {
    const { intro } = setup('first', { hostAliases: () => Promise.resolve([]) })
    await intro.start()
    expect(intro.plan.value?.journey).toBe('nohosts')
  })

  it('treats an unreadable host list as first', async () => {
    const { intro } = setup('first', { hostAliases: () => Promise.resolve(null) })
    await intro.start()
    expect(intro.plan.value?.journey).toBe('first')
  })

  it('stays off for never, still recording the launch', async () => {
    const { intro, launch } = setup('first', { mode: () => 'never' })
    await intro.start()
    expect(launch).toHaveBeenCalledTimes(1)
    expect(intro.plan.value).toBeNull()
  })

  it('plays only the first journey for first_launch', async () => {
    const { intro } = setup('returning', { mode: () => 'first_launch' })
    await intro.start()
    expect(intro.plan.value).toBeNull()
  })

  it('plays back with the report scene', async () => {
    const { intro } = setup('returning')
    await intro.start()
    expect(intro.plan.value?.journey).toBe('back')
    expect(intro.plan.value?.scene.issues.crit).toBe(1)
    expect(intro.plan.value?.scene.dunes).toHaveLength(1)
  })

  it('falls back to daily without a report', async () => {
    const { intro } = setup('returning', { report: () => Promise.resolve(null) })
    await intro.start()
    expect(intro.plan.value?.journey).toBe('daily')
  })

  it('plays daily', async () => {
    const { intro } = setup('daily')
    await intro.start()
    expect(intro.plan.value?.journey).toBe('daily')
  })

  it('does not block the app when the launch fails', async () => {
    const { intro } = setup(new Error('boom'))
    await expect(intro.start()).resolves.toBeUndefined()
    expect(intro.plan.value).toBeNull()
  })

  it('does not block the app when the report read throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { intro } = setup('returning', { report: () => Promise.reject(new Error('x')) })
    await expect(intro.start()).resolves.toBeUndefined()
    expect(intro.plan.value).toBeNull()
  })

  it('obeys the development switches', async () => {
    const { intro } = setup('daily', {
      dev: true,
      mode: () => 'never',
      search: '?introJourney=back&introT=3&introReduce=1',
    })
    await intro.start()
    expect(intro.plan.value).toMatchObject({ journey: 'back', freezeAt: 3, reducedMotion: true })
  })

  it('ignores the switches outside development', async () => {
    const { intro } = setup('daily', { dev: false, search: '?introJourney=first' })
    await intro.start()
    expect(intro.plan.value?.journey).toBe('daily')
  })
})

describe('useIntro ending', () => {
  it('fades for 200 ms on a key, then drops the overlay', async () => {
    const { intro } = setup('daily')
    await intro.start()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }))
    expect(intro.leaving.value).toBe(true)
    expect(intro.plan.value).not.toBeNull()
    vi.advanceTimersByTime(FADE_MS - 1)
    expect(intro.plan.value).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(intro.plan.value).toBeNull()
    expect(intro.leaving.value).toBe(false)
  })

  it('swallows the key so the app underneath does not get it', async () => {
    const { intro } = setup('daily')
    await intro.start()
    const e = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })
    window.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
  })

  it('does not end on a lone modifier key', async () => {
    const { intro } = setup('daily')
    await intro.start()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta' }))
    expect(intro.leaving.value).toBe(false)
  })

  it('skips on a click', async () => {
    const { intro } = setup('daily')
    await intro.start()
    intro.skip()
    vi.advanceTimersByTime(FADE_MS)
    expect(intro.plan.value).toBeNull()
  })

  it('goes at once with Reduce Motion', async () => {
    const { intro } = setup('daily', { reducedMotion: () => true })
    await intro.start()
    intro.finish()
    expect(intro.plan.value).toBeNull()
  })

  it('stops listening for keys once it is gone', async () => {
    const { intro } = setup('daily', { reducedMotion: () => true })
    await intro.start()
    intro.finish()
    await Promise.resolve()
    const e = new KeyboardEvent('keydown', { key: 'a', cancelable: true })
    window.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(false)
  })
})
