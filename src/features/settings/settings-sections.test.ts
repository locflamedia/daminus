// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetSettingsMock, settingsAnswer } from '@/api/dev-mock-settings'
import { clearMocks, mockCommands } from '@/api/testing'
import { i18n, setI18nLocale } from '@/i18n'
import { useSettingsStore } from '@/stores/settings'
import SettingsAppearance from './SettingsAppearance.vue'
import SettingsGeneral from './SettingsGeneral.vue'

async function mountSection(section: typeof SettingsGeneral | typeof SettingsAppearance) {
  const pinia = createPinia()
  setActivePinia(pinia)
  mockCommands((cmd, args) => settingsAnswer(cmd, args) ?? null)
  const store = useSettingsStore()
  store.init()
  await store.load()
  const wrapper = mount(section, { global: { plugins: [pinia, i18n] }, attachTo: document.body })
  await flushPromises()
  return { wrapper, store }
}

beforeEach(() => {
  resetSettingsMock()
  localStorage.clear()
  delete document.documentElement.dataset.theme
  setI18nLocale('en')
})

afterEach(() => {
  clearMocks()
  document.body.replaceChildren()
})

describe('Settings › General', () => {
  it('draws the language, its formats, the opening choices and the preview', async () => {
    const { wrapper } = await mountSection(SettingsGeneral)
    const text = wrapper.text()
    for (const word of ['App language', 'AI answers in', 'Region formats', 'Scan on open']) {
      expect(text).toContain(word)
    }
    expect(text).toContain('1,240.5 MB')
    expect(text).toContain('Live preview')
    expect(text).toContain('Never translated')
  })

  it('lists the languages that cannot be chosen yet as dimmed rows with their share', async () => {
    const { wrapper } = await mountSection(SettingsGeneral)
    await wrapper.get('button[role="combobox"], .field, button').trigger('click')
    const text = document.body.textContent ?? ''
    expect(text).toContain('Not translated yet')
    expect(text).toContain('34%')
    expect(text).toContain('Help translate Daminus')
  })

  it('switches the app and the formats at once, and says so in the preview', async () => {
    const { wrapper, store } = await mountSection(SettingsGeneral)
    store.setLanguage('vi')
    await flushPromises()
    expect(wrapper.text()).toContain('1.240,5 MB')
    expect(wrapper.text()).toContain('2 giờ trước')
  })

  it('saves the AI language, scan on open and the intro', async () => {
    const { wrapper, store } = await mountSection(SettingsGeneral)
    const radios = wrapper.findAll('[role="radio"]')
    const english = radios.find((r) => r.text() === 'English')
    await english?.trigger('click')
    expect(store.general.ai_language).toBe('en')
    await wrapper.get('input[type="checkbox"]').setValue(true)
    expect(store.general.scan_on_open).toBe(true)
    await radios.find((r) => r.text() === 'Never')?.trigger('click')
    expect(store.general.intro).toBe('never')
  })
})

describe('Settings › Appearance', () => {
  it('shows three theme cards with Match system chosen first', async () => {
    const { wrapper } = await mountSection(SettingsAppearance)
    const cards = wrapper.findAll('.choice')
    expect(cards.map((c) => c.get('.words b').text())).toEqual(['Light', 'Dark', 'Match system'])
    expect(cards.map((c) => c.attributes('aria-checked'))).toEqual(['false', 'false', 'true'])
  })

  it('chooses a theme by click and by arrow key', async () => {
    const { wrapper, store } = await mountSection(SettingsAppearance)
    await wrapper.findAll('.choice')[1]?.trigger('click')
    expect(store.theme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    await wrapper.findAll('.choice')[1]?.trigger('keydown', { key: 'ArrowLeft' })
    expect(store.theme).toBe('light')
  })

  it('holds the motion choices and the four small pleasures with their defaults', async () => {
    const { wrapper, store } = await mountSection(SettingsAppearance)
    const text = wrapper.text()
    for (const word of ['Reduce motion', 'Follows macOS', 'Clear-sky moment', 'Easter eggs']) {
      expect(text).toContain(word)
    }
    const boxes = wrapper.findAll('input[type="checkbox"]')
    expect(boxes.map((b) => (b.element as HTMLInputElement).checked)).toEqual([
      false,
      true,
      true,
      true,
      false,
      true,
    ])
    await boxes[0]?.setValue(true)
    expect(store.appearance.reduce_transparency).toBe(true)
    expect(document.documentElement.dataset.transparency).toBe('reduced')
  })

  it('reads in Vietnamese', async () => {
    const { wrapper, store } = await mountSection(SettingsAppearance)
    store.setLanguage('vi')
    await flushPromises()
    expect(wrapper.text()).toContain('Theo hệ thống')
    expect(wrapper.text()).toContain('Giảm chuyển động')
  })
})
