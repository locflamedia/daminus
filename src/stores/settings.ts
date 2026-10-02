// Look-and-feel preferences: language, theme and the sidebar fold. They apply at once (no
// reload) and are remembered in this webview's localStorage. The persistent settings file
// the core owns (`Settings`) gets its own commands with the Settings screens.
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { type Locale, DEFAULT_LOCALE, isLocale, localeFromTag, setI18nLocale } from '@/i18n'
import { crossFade } from '@/lib/cross-fade'
import { readJson, writeJson } from '@/lib/storage'
import { type Theme, applyTheme, isTheme } from '@/lib/theme'
import { SIDEBAR_RANGES, type SidebarRange } from '@/lib/viewport'

const KEY = 'daminus.ui.v1'

interface Stored {
  language?: unknown
  theme?: unknown
  folded?: Record<string, unknown>
}

export const useSettingsStore = defineStore('settings', () => {
  const language = ref<Locale>(DEFAULT_LOCALE)
  const theme = ref<Theme>('system')
  /** Sidebar fold the user chose, per width range; absent = follow the range's default. */
  const folded = ref<Partial<Record<SidebarRange, boolean>>>({})
  // What the user last chose, kept apart from the refs: with View Transitions the refs change
  // inside an async callback, after the choice is made, and saving them would store the
  // previous value.
  const chosen: { language: Locale; theme: Theme } = { language: DEFAULT_LOCALE, theme: 'system' }

  function persist() {
    writeJson(KEY, { language: chosen.language, theme: chosen.theme, folded: folded.value })
  }

  function applyLanguage(next: Locale) {
    language.value = next
    setI18nLocale(next)
    document.documentElement.lang = next
  }

  /** Reads what was saved (or the OS language) and applies it, without a transition. */
  function init() {
    const stored = readJson<Stored>(KEY, {})
    chosen.language = isLocale(stored.language)
      ? stored.language
      : localeFromTag(typeof navigator === 'undefined' ? undefined : navigator.language)
    chosen.theme = isTheme(stored.theme) ? stored.theme : 'system'
    applyLanguage(chosen.language)
    theme.value = chosen.theme
    applyTheme(theme.value)
    folded.value = {}
    for (const range of SIDEBAR_RANGES) {
      const value = stored.folded?.[range]
      if (typeof value === 'boolean') folded.value[range] = value
    }
  }

  function setLanguage(next: Locale) {
    if (next === chosen.language) return
    chosen.language = next
    crossFade(() => applyLanguage(next))
    persist()
  }

  function setTheme(next: Theme) {
    if (next === chosen.theme) return
    chosen.theme = next
    crossFade(() => {
      theme.value = next
      applyTheme(next)
    })
    persist()
  }

  /** Whether the sidebar is a rail in `range`: the user's choice, else only when narrow. */
  function isFolded(range: SidebarRange): boolean {
    return folded.value[range] ?? range === 'narrow'
  }

  function toggleFolded(range: SidebarRange) {
    folded.value = { ...folded.value, [range]: !isFolded(range) }
    persist()
  }

  return { language, theme, folded, init, setLanguage, setTheme, isFolded, toggleFolded }
})
