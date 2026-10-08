// @vitest-environment happy-dom
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Settings } from '@/api'
import { resetSettingsMock, settingsAnswer } from '@/api/dev-mock-settings'
import { clearMocks, mockCommands } from '@/api/testing'
import { setI18nLocale } from '@/i18n'
import { useSettingsStore } from './settings'
import { useToastStore } from './toasts'

const calls: { cmd: string; args: Record<string, unknown> }[] = []

function install(onSet?: () => void) {
  mockCommands((cmd, args) => {
    calls.push({ cmd, args })
    if (cmd !== 'settings_get') onSet?.()
    return settingsAnswer(cmd, args) ?? null
  })
}

function fresh() {
  setActivePinia(createPinia())
  const store = useSettingsStore()
  store.init()
  return store
}

beforeEach(() => {
  resetSettingsMock()
  calls.length = 0
  localStorage.clear()
  delete document.documentElement.dataset.theme
  delete document.documentElement.dataset.transparency
  delete document.documentElement.dataset.charts
  setI18nLocale('en')
})

afterEach(() => clearMocks())

describe('settings kept by the core', () => {
  it('sends nothing before the core has answered', async () => {
    install()
    const store = fresh()
    store.setLanguage('vi')
    store.setAppearanceFlag('clear_sky', false)
    await flushPromises()
    expect(calls).toEqual([])
  })

  it('takes language, theme and flags from what the core saved', async () => {
    install()
    const store = fresh()
    await store.load()
    store.setTheme('dark')
    store.setAppearanceFlag('reduce_transparency', true)
    await flushPromises()
    const again = fresh()
    await again.load()
    expect(again.theme).toBe('dark')
    expect(again.appearance.reduce_transparency).toBe(true)
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.dataset.transparency).toBe('reduced')
  })

  it('sends the whole General section, one save after another', async () => {
    install()
    const store = fresh()
    await store.load()
    store.setLanguage('vi')
    store.setIntro('never')
    store.setAiLanguage('en')
    store.setScanOnOpen(true)
    await flushPromises()
    const sent = calls.filter((c) => c.cmd === 'settings_set_general').map((c) => c.args.general)
    expect(sent.at(-1)).toEqual({
      language: 'vi',
      ai_language: 'en',
      scan_on_open: true,
      intro: 'never',
    })
    expect(sent).toHaveLength(4)
  })

  it('switches charts to still and back through the root attribute', async () => {
    install()
    const store = fresh()
    await store.load()
    store.setAppearanceFlag('animate_charts', false)
    expect(document.documentElement.dataset.charts).toBe('still')
    store.setAppearanceFlag('animate_charts', true)
    expect(document.documentElement.dataset.charts).toBeUndefined()
  })

  it('tells the person when the core refuses, and reads the saved file again', async () => {
    install()
    const store = fresh()
    await store.load()
    store.general.language = 'xx'
    store.setScanOnOpen(true)
    await flushPromises()
    expect(useToastStore().toasts[0]?.tone).toBe('crit')
    expect(calls.filter((c) => c.cmd === 'settings_get')).toHaveLength(2)
    expect(store.general.language).toBe('en')
    expect(store.general.scan_on_open).toBe(false)
  })

  it('keeps the local copy when the core cannot be read', async () => {
    mockCommands(() => {
      throw new Error('no core')
    })
    const store = fresh()
    store.setTheme('light')
    await store.load()
    expect(store.synced).toBe(false)
    expect(store.theme).toBe('light')
  })

  it('reads a Settings object without losing the sections it does not edit', async () => {
    install()
    const store = fresh()
    await store.load()
    const saved = settingsAnswer('settings_get', {}) as Settings
    expect(saved.scan.connect_timeout_s).toBe(10)
  })
})
