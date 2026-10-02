// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { currentLocale, setI18nLocale } from '@/i18n'
import { useSettingsStore } from './settings'

const html = () => document.documentElement

function fresh() {
  setActivePinia(createPinia())
  const store = useSettingsStore()
  store.init()
  return store
}

beforeEach(() => {
  localStorage.clear()
  delete html().dataset.theme
  html().lang = ''
  setI18nLocale('en')
})

afterEach(() => vi.restoreAllMocks())

describe('theme switching', () => {
  it('follows the system by default: no data-theme, so prefers-color-scheme decides', () => {
    const store = fresh()
    expect(store.theme).toBe('system')
    expect(html().dataset.theme).toBeUndefined()
  })

  it('sets data-theme for light and dark, and removes it for system', () => {
    const store = fresh()
    store.setTheme('dark')
    expect(html().dataset.theme).toBe('dark')
    store.setTheme('light')
    expect(html().dataset.theme).toBe('light')
    store.setTheme('system')
    expect(html().dataset.theme).toBeUndefined()
  })

  it('is remembered across launches', () => {
    fresh().setTheme('dark')
    delete html().dataset.theme
    const again = fresh()
    expect(again.theme).toBe('dark')
    expect(html().dataset.theme).toBe('dark')
  })

  it('ignores a saved theme it does not know', () => {
    localStorage.setItem('daminus.ui.v1', JSON.stringify({ theme: 'sepia' }))
    expect(fresh().theme).toBe('system')
  })

  it('cross-fades through the class fallback when View Transitions are missing', () => {
    vi.useFakeTimers()
    const store = fresh()
    store.setTheme('dark')
    expect(html().classList.contains('cross-fading')).toBe(true)
    vi.advanceTimersByTime(300)
    expect(html().classList.contains('cross-fading')).toBe(false)
    vi.useRealTimers()
  })

  it('switches at once, with no fade class, under Reduce Motion', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as MediaQueryList)
    const store = fresh()
    store.setTheme('dark')
    expect(html().dataset.theme).toBe('dark')
    expect(html().classList.contains('cross-fading')).toBe(false)
  })
})

describe('language switching', () => {
  it('starts in the OS language when nothing was saved', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('vi-VN')
    const store = fresh()
    expect(store.language).toBe('vi')
    expect(currentLocale()).toBe('vi')
    expect(html().lang).toBe('vi')
  })

  it('falls back to English for any other OS language', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('de-DE')
    expect(fresh().language).toBe('en')
  })

  it('changes the live locale and <html lang> without a reload', () => {
    const store = fresh()
    store.setLanguage('vi')
    expect(currentLocale()).toBe('vi')
    expect(html().lang).toBe('vi')
    store.setLanguage('en')
    expect(currentLocale()).toBe('en')
    expect(html().lang).toBe('en')
  })

  it('is remembered, and wins over the OS language', () => {
    fresh().setLanguage('vi')
    setI18nLocale('en')
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-US')
    expect(fresh().language).toBe('vi')
    expect(currentLocale()).toBe('vi')
  })
})

describe('sidebar fold', () => {
  it('is a rail only in the narrow range until the user chooses otherwise', () => {
    const store = fresh()
    expect(store.isFolded('wide')).toBe(false)
    expect(store.isFolded('medium')).toBe(false)
    expect(store.isFolded('narrow')).toBe(true)
  })

  it('remembers the choice per width range', () => {
    const store = fresh()
    store.toggleFolded('wide')
    store.toggleFolded('narrow')
    expect(store.isFolded('wide')).toBe(true)
    expect(store.isFolded('narrow')).toBe(false)
    expect(store.isFolded('medium')).toBe(false)

    const again = fresh()
    expect(again.isFolded('wide')).toBe(true)
    expect(again.isFolded('narrow')).toBe(false)
  })
})

describe('storage that fails', () => {
  it('still applies settings for the session when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const store = fresh()
    expect(() => store.setTheme('dark')).not.toThrow()
    expect(html().dataset.theme).toBe('dark')
  })
})
