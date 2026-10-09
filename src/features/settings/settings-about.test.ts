// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearMocks, mockCommands } from '@/api/testing'
import { i18n, setI18nLocale } from '@/i18n'
import { useAboutStore } from '@/stores/about'
import { useToastStore } from '@/stores/toasts'
import SettingsAbout from './SettingsAbout.vue'

const copied = vi.hoisted(() => ({ text: [] as string[], fail: false }))
vi.mock('@/api/clipboard', () => ({
  copyText: (text: string) => {
    if (copied.fail) return Promise.reject(new Error('refused'))
    copied.text.push(text)
    return Promise.resolve()
  },
}))

const calls: string[] = []

async function mountAbout(agent: unknown = { present: true, has_keys: true, keys: 2 }) {
  const pinia = createPinia()
  setActivePinia(pinia)
  mockCommands((cmd) => {
    calls.push(cmd)
    if (cmd === 'agent_status') {
      if (agent === 'fail') throw new Error('no')
      return agent
    }
    if (cmd === 'diagnostics_collect') return { text: 'Daminus 0.1.0\nPATH: /usr/bin' }
    return null
  })
  const wrapper = mount(SettingsAbout, { global: { plugins: [pinia, i18n] } })
  await flushPromises()
  return { wrapper, toasts: useToastStore(), about: useAboutStore() }
}

beforeEach(() => {
  calls.length = 0
  copied.text = []
  copied.fail = false
  setI18nLocale('en')
})

afterEach(() => clearMocks())

describe('Settings › About', () => {
  it('shows the name, the version and the credits', async () => {
    const { wrapper } = await mountAbout()
    const text = wrapper.text()
    expect(text).toContain('Daminus')
    expect(text).toMatch(/\d+\.\d+\.\d+/)
    expect(text).toContain('Made in Việt Nam · MIT')
    expect(text).toContain('The Starry Night, Vincent van Gogh, 1889 · public domain')
    expect(text).toContain('Marks by thesvg · Type by Geist · Flags by flag-icons')
    expect(text).not.toMatch(/up to date/i)
  })

  it('floats the icon gently and keeps still for reduced motion', () => {
    const source = readFileSync('src/features/settings/AboutIdentityCard.vue', 'utf8')
    expect(source).toContain('float 5s ease-in-out infinite')
    expect(source).toContain('translateY(-5px)')
    expect(source).toMatch(/prefers-reduced-motion: reduce\)[^]*animation: none/)
  })

  it('says how many keys the ssh agent holds, and when it has none or is not running', async () => {
    expect((await mountAbout()).wrapper.text()).toContain('Running · 2 keys')
    expect(
      (await mountAbout({ present: true, has_keys: false, keys: 0 })).wrapper.text(),
    ).toContain('Running · no keys')
    expect(
      (await mountAbout({ present: false, has_keys: false, keys: 0 })).wrapper.text(),
    ).toContain('Not running')
    expect((await mountAbout('fail')).wrapper.text()).toContain('Could not ask')
  })

  it('copies the diagnostics the core built and sends nothing anywhere', async () => {
    const { wrapper, toasts } = await mountAbout()
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Copy diagnostics')
      ?.trigger('click')
    await flushPromises()
    expect(copied.text).toEqual(['Daminus 0.1.0\nPATH: /usr/bin'])
    expect(calls.filter((c) => c === 'diagnostics_collect')).toHaveLength(1)
    expect(toasts.toasts[0]?.title).toBe('Diagnostics copied.')
  })

  it('says so when the clipboard refuses', async () => {
    copied.fail = true
    const { wrapper, toasts } = await mountAbout()
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Copy diagnostics')
      ?.trigger('click')
    await flushPromises()
    expect(toasts.toasts[0]).toMatchObject({
      tone: 'crit',
      title: "Couldn't copy the diagnostics.",
    })
  })

  it('is written in Vietnamese too', async () => {
    const { wrapper } = await mountAbout()
    setI18nLocale('vi')
    await flushPromises()
    expect(wrapper.text()).toContain('Làm tại Việt Nam · MIT')
    expect(wrapper.text()).toContain('Đêm đầy sao, Vincent van Gogh, 1889')
    expect(wrapper.text()).toContain('Sao chép chẩn đoán')
  })
})
