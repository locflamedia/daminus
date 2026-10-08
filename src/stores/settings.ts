// Look-and-feel preferences: language, theme and the sidebar fold, and the General and
// Appearance sections of `settings.json`. A choice applies at once (no reload); the core keeps
// the sections (`settings_set_general`, `settings_set_appearance` check the whole file again)
// and the webview's localStorage keeps a copy of language and theme so the first paint is
// right before the core has answered.
import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  type AppError,
  type AppearanceSettings,
  type GeneralSettings,
  type IntroMode,
  type Settings,
  settingsGet,
  settingsSetAppearance,
  settingsSetGeneral,
} from '@/api'
import {
  type Locale,
  DEFAULT_LOCALE,
  currentLocale,
  isLocale,
  localeFromTag,
  setI18nLocale,
  t,
} from '@/i18n'
import { crossFade } from '@/lib/cross-fade'
import { errorText } from '@/lib/issue-text'
import {
  type AppearanceFlag,
  DEFAULT_APPEARANCE,
  DEFAULT_GENERAL,
  applyAppearance,
  readFlags,
} from '@/lib/preferences'
import { readJson, writeJson } from '@/lib/storage'
import { type Theme, applyTheme, isTheme } from '@/lib/theme'
import { SIDEBAR_RANGES, type SidebarRange } from '@/lib/viewport'
import { useToastStore } from './toasts'

const KEY = 'daminus.ui.v1'

interface Stored {
  language?: unknown
  theme?: unknown
  folded?: Record<string, unknown>
  flags?: unknown
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
  /** The General and Appearance sections as the core last saved them, plus what was chosen since. */
  const general = ref<GeneralSettings>({ ...DEFAULT_GENERAL })
  const appearance = ref<AppearanceSettings>({ ...DEFAULT_APPEARANCE })
  /** True once the core has answered: until then (a plain browser, a test) nothing is sent. */
  const synced = ref(false)
  // Saves go one after the other, so the file ends as the last choice left it.
  let queue: Promise<unknown> = Promise.resolve()
  /** Counts the saves queued, so a read that began before one never overwrites its choice. */
  let saves = 0
  /** Sections the user changed before the core first answered; they are sent once it does. */
  const unsent = { general: false, appearance: false }

  function persist() {
    writeJson(KEY, {
      language: chosen.language,
      theme: chosen.theme,
      folded: folded.value,
      flags: appearance.value,
    })
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
    general.value = { ...general.value, language: chosen.language }
    appearance.value = { ...DEFAULT_APPEARANCE, ...readFlags(stored.flags), theme: chosen.theme }
    applyAppearance(appearance.value)
    folded.value = {}
    for (const range of SIDEBAR_RANGES) {
      const value = stored.folded?.[range]
      if (typeof value === 'boolean') folded.value[range] = value
    }
  }

  /** Sends one section to the core, after the saves before it; a refusal reloads what is saved. */
  function save(section: keyof typeof unsent, send: () => Promise<Settings>) {
    if (!synced.value) {
      unsent[section] = true
      return
    }
    saves += 1
    queue = queue.then(send).then(
      () => undefined,
      async (error: unknown) => {
        useToastStore().push({ tone: 'crit', title: failureText(error) })
        await read()
      },
    )
  }

  function saveGeneral() {
    save('general', () => settingsSetGeneral({ ...general.value }))
  }

  function saveAppearance() {
    save('appearance', () => settingsSetAppearance({ ...appearance.value }))
  }

  /** Takes what the core saved as the truth: the sections, the language, the theme, the flags. */
  function adopt(saved: Settings) {
    general.value = { ...saved.general }
    appearance.value = { ...saved.appearance }
    chosen.language = localeFromTag(saved.general.language)
    chosen.theme = isTheme(saved.appearance.theme) ? saved.appearance.theme : 'system'
    applyLanguage(chosen.language)
    theme.value = chosen.theme
    applyTheme(chosen.theme)
    applyAppearance(appearance.value)
    persist()
  }

  /** Puts back the sections chosen before the first answer and sends them. */
  function keepChosen(general_: GeneralSettings | null, appearance_: AppearanceSettings | null) {
    if (general_) {
      general.value = general_
      chosen.language = localeFromTag(general_.language)
      applyLanguage(chosen.language)
    }
    if (appearance_) {
      appearance.value = appearance_
      chosen.theme = isTheme(appearance_.theme) ? appearance_.theme : 'system'
      theme.value = chosen.theme
      applyTheme(chosen.theme)
      applyAppearance(appearance_)
    }
    persist()
    if (general_) saveGeneral()
    if (appearance_) saveAppearance()
  }

  async function read() {
    const started = saves
    try {
      const answer = await settingsGet()
      if (saves !== started) return
      const keepGeneral = unsent.general ? { ...general.value } : null
      const keepAppearance = unsent.appearance ? { ...appearance.value } : null
      unsent.general = false
      unsent.appearance = false
      adopt(answer)
      synced.value = true
      if (keepGeneral || keepAppearance) keepChosen(keepGeneral, keepAppearance)
    } catch {
      // The local copy of language and theme stays; nothing is sent until a read succeeds.
    }
  }

  /** Reads `settings.json` after the saves already queued; a failed read leaves the local copy. */
  function load(): Promise<void> {
    const run = queue.then(read)
    queue = run
    return run
  }

  function setLanguage(next: Locale) {
    if (next === chosen.language) return
    chosen.language = next
    general.value = { ...general.value, language: next }
    crossFade(() => applyLanguage(next))
    persist()
    saveGeneral()
  }

  function setTheme(next: Theme) {
    if (next === chosen.theme) return
    chosen.theme = next
    appearance.value = { ...appearance.value, theme: next }
    crossFade(() => {
      theme.value = next
      applyTheme(next)
    })
    persist()
    saveAppearance()
  }

  /** The language of AI answers; `null` follows the app. */
  function setAiLanguage(next: Locale | null) {
    general.value = { ...general.value, ai_language: next }
    saveGeneral()
  }

  function setScanOnOpen(next: boolean) {
    general.value = { ...general.value, scan_on_open: next }
    saveGeneral()
  }

  /** Whether the intro plays on the first launch, every launch or never (General and Appearance). */
  function setIntro(next: IntroMode) {
    general.value = { ...general.value, intro: next }
    saveGeneral()
  }

  function setAppearanceFlag(flag: AppearanceFlag, next: boolean) {
    appearance.value = { ...appearance.value, [flag]: next }
    applyAppearance(appearance.value)
    saveAppearance()
  }

  /** Whether the sidebar is a rail in `range`: the user's choice, else only when narrow. */
  function isFolded(range: SidebarRange): boolean {
    return folded.value[range] ?? range === 'narrow'
  }

  function toggleFolded(range: SidebarRange) {
    folded.value = { ...folded.value, [range]: !isFolded(range) }
    persist()
  }

  return {
    language,
    theme,
    folded,
    general,
    appearance,
    synced,
    init,
    load,
    setLanguage,
    setTheme,
    setAiLanguage,
    setScanOnOpen,
    setIntro,
    setAppearanceFlag,
    isFolded,
    toggleFolded,
  }
})

/** The words for a refused or failed save: the core's own error in the app language. */
function failureText(error: unknown): string {
  const known = typeof error === 'object' && error !== null && 'code' in error
  return known ? errorText(error as AppError, currentLocale()) : t('settingsGeneral.saveFailed')
}
