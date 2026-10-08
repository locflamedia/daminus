// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetDataMock } from '@/api/dev-mock-data'
import { resetSettingsMock, settingsAnswer } from '@/api/dev-mock-settings'
import { clearMocks, mockCommands } from '@/api/testing'
import { i18n, setI18nLocale } from '@/i18n'
import { useDataStore } from '@/stores/data'
import { useSettingsStore } from '@/stores/settings'
import { useToastStore } from '@/stores/toasts'
import SettingsData from './SettingsData.vue'

const calls: string[] = []
const mounted: { unmount: () => void }[] = []

async function mountData(failing: string[] = []) {
  const pinia = createPinia()
  setActivePinia(pinia)
  mockCommands((cmd, args) => {
    calls.push(cmd)
    if (failing.includes(cmd)) {
      throw { code: { kind: 'io', path: '/x' }, params: {}, retryable: false }
    }
    if (cmd === 'history_list') {
      return {
        scans: [
          { seq: 1, started_at: '2026-09-15T01:00:00Z', finished_at: '2026-09-15T01:01:00Z' },
        ],
        keep: 20,
        bytes: 1,
      }
    }
    return settingsAnswer(cmd, args) ?? null
  })
  const settings = useSettingsStore()
  settings.init()
  await settings.load()
  const wrapper = mount(SettingsData, {
    global: { plugins: [pinia, i18n] },
    attachTo: document.body,
  })
  mounted.push(wrapper)
  await flushPromises()
  return { wrapper, data: useDataStore(), toasts: useToastStore() }
}

beforeEach(() => {
  calls.length = 0
  resetSettingsMock()
  resetDataMock()
  localStorage.clear()
  setI18nLocale('en')
  const target = document.createElement('div')
  target.id = 'settings-actions'
  document.body.append(target)
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  clearMocks()
  document.body.replaceChildren()
})

describe('Settings › Data', () => {
  it('draws the folder, the retention, the lists, the export, the backups and the way out', async () => {
    await mountData()
    const text = document.body.textContent ?? ''
    for (const word of [
      'On this Mac',
      '~/Library/Application Support/dev.daminus.app',
      'JSON, 15 files',
      'Scan results',
      'Keep scans',
      '12 of 20 used. Oldest go first.',
      'Forget AI replies after',
      'Never stored',
      'Passwords and .env values',
      'AI keys live in the macOS Keychain',
      'Size over scans',
      '#1 · 15 Sep',
      'projects, settings, state, 12 scans',
      'Export all scans',
      '"[not stored]"',
      'Time Machine includes this folder',
      'off by design',
      'Hold to delete history',
      'Reset all settings too…',
      'Show in Finder',
    ]) {
      expect(text).toContain(word)
    }
  })

  it('says how a scan costs and where the folder levels off at the limit', async () => {
    await mountData()
    const text = document.body.textContent ?? ''
    expect(text).toMatch(/≈ [\d.]+ MB per scan/)
    expect(text).toMatch(/At 20 scans kept it levels off near [\d.]+ MB\./)
  })

  it('saves a retention choice at once and keeps the other one', async () => {
    const { wrapper, data } = await mountData()
    const fifty = wrapper.findAll('button').find((b) => b.text() === '50')
    await fifty?.trigger('click')
    await flushPromises()
    expect(calls).toContain('settings_set_data')
    expect(data.retention).toEqual({ keep_scans: 50, forget_ai_after_days: 30 })

    const never = wrapper.findAll('button').find((b) => b.text() === 'Never')
    await never?.trigger('click')
    await flushPromises()
    expect(data.retention).toEqual({ keep_scans: 50, forget_ai_after_days: null })
    expect((await settingsAnswer('settings_get', {})) as { data: unknown }).toMatchObject({
      data: { keep_scans: 50, forget_ai_after_days: null },
    })
  })

  it('says nothing is removed when every scan is kept', async () => {
    const { wrapper } = await mountData()
    const all = wrapper.findAll('button').find((b) => b.text() === 'All')
    await all?.trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('12 kept. None are removed.')
    expect(document.body.textContent).not.toContain('levels off')
  })

  it('shows the name of the file an export wrote', async () => {
    const { wrapper } = await mountData()
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Export all scans')
      ?.trigger('click')
    await flushPromises()
    expect(calls).toContain('data_export')
    expect(document.body.textContent).toContain('daminus-scans.json · Downloads')
  })

  it('keeps Import off, since nothing can read a file back yet', async () => {
    const { wrapper } = await mountData()
    const button = wrapper.findAll('button').find((b) => b.text() === 'Import…')
    expect(button?.attributes('disabled')).toBeDefined()
  })

  it('opens the folder in Finder from the header button', async () => {
    await mountData()
    const button = [...document.querySelectorAll('#settings-actions button')].find((b) =>
      b.textContent?.includes('Show in Finder'),
    )
    button?.dispatchEvent(new Event('click'))
    await flushPromises()
    expect(calls).toContain('reveal_config_dir')
  })

  it('deletes the history only after a confirmed hold or dialog, and says how many went', async () => {
    const { data, toasts } = await mountData()
    await data.clearHistory()
    expect(calls).toContain('data_clear')
    expect(data.usage?.scans).toBe(0)
    expect(toasts.toasts[0]?.title).toBe('Deleted 12 scans')
  })

  it('resets the settings behind a confirm and reads them back', async () => {
    const { wrapper, data } = await mountData()
    data.setKeep(50)
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Reset all settings too…')
      ?.trigger('click')
    await flushPromises()
    expect(calls).not.toContain('settings_reset')
    const confirm = [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Reset settings',
    )
    confirm?.dispatchEvent(new Event('click'))
    await flushPromises()
    expect(calls).toContain('settings_reset')
    expect(data.retention.keep_scans).toBe(20)
  })

  it('tells the user when a save is refused and puts the saved choice back', async () => {
    const { wrapper, data, toasts } = await mountData(['settings_set_data'])
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '10')
      ?.trigger('click')
    await flushPromises()
    expect(toasts.toasts.some((t) => t.tone === 'crit')).toBe(true)
    expect(data.retention.keep_scans).toBe(20)
  })

  it('is written in Vietnamese too', async () => {
    await mountData()
    setI18nLocale('vi')
    await flushPromises()
    const text = document.body.textContent ?? ''
    expect(text).toContain('Trên máy Mac này')
    expect(text).toContain('Giữ lại số lần quét')
    expect(text).toContain('Hiện trong Finder')
  })

  it('draws an empty folder without a curve', async () => {
    const { data } = await mountData()
    await data.clearHistory()
    await flushPromises()
    expect(document.querySelector('svg[role="img"][aria-label]')).toBeNull()
    expect(document.body.textContent).toContain('JSON, 3 files')
  })
})
