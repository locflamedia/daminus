// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { clearMocks, mockCommands } from '@/api/testing'
import { i18n } from '@/i18n'
import IntroHost from './IntroHost.vue'
import { FADE_MS } from './use-intro'

const calls: string[] = []

async function host(force = true, bare = false) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' }, meta: { bare } }],
  })
  await router.push('/')
  const wrapper = mount(IntroHost, {
    props: { force },
    global: {
      plugins: [i18n, router],
      stubs: { IntroStage: { template: '<div data-testid="stage" />' } },
    },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  calls.length = 0
  mockCommands((cmd) => {
    calls.push(cmd)
    if (cmd === 'app_launch') return { kind: 'daily', previous: null }
    return null
  })
})
afterEach(() => {
  clearMocks()
  vi.useRealTimers()
})

describe('IntroHost', () => {
  it('stays off in tests unless forced', async () => {
    const wrapper = await host(false)
    expect(calls).not.toContain('app_launch')
    expect(wrapper.find('[data-testid="intro-host"]').exists()).toBe(false)
  })

  it('stays off on a bare route', async () => {
    const wrapper = await host(true, true)
    expect(calls).not.toContain('app_launch')
    expect(wrapper.find('[data-testid="intro-host"]').exists()).toBe(false)
  })

  it('records the launch once and plays the daily journey when asked', async () => {
    const { useSettingsStore } = await import('@/stores/settings')
    useSettingsStore().general = { ...useSettingsStore().general, intro: 'always' }
    const wrapper = await host()
    expect(calls.filter((c) => c === 'app_launch')).toHaveLength(1)
    expect(wrapper.find('[data-testid="stage"]').exists()).toBe(true)
  })

  it('fades out for 200 ms after a click, then unmounts the stage', async () => {
    const { useSettingsStore } = await import('@/stores/settings')
    useSettingsStore().general = { ...useSettingsStore().general, intro: 'always' }
    const wrapper = await host()
    vi.useFakeTimers()
    await wrapper.find('[data-testid="intro-host"]').trigger('click')
    expect(wrapper.find('[data-testid="intro-host"]').classes()).toContain('leaving')
    vi.advanceTimersByTime(FADE_MS)
    await flushPromises()
    expect(wrapper.find('[data-testid="intro-host"]').exists()).toBe(false)
  })

  it('leaves the app alone when every command fails', async () => {
    mockCommands(() => {
      throw new Error('no')
    })
    const wrapper = await host()
    expect(wrapper.find('[data-testid="intro-host"]').exists()).toBe(false)
  })
})
