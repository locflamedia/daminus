// The one i18n instance. Messages are bundled (no network), the locale is a ref, so
// switching language re-renders every `t()` call live, with no reload.
import { createI18n } from 'vue-i18n'
import { messages } from './messages'

export const LOCALES = ['en', 'vi'] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en'

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/** The app language for a browser language tag: Vietnamese stays, anything else is English. */
export function localeFromTag(tag: string | undefined): Locale {
  return tag?.toLowerCase().startsWith('vi') ? 'vi' : DEFAULT_LOCALE
}

export const i18n = createI18n({
  legacy: false,
  locale: DEFAULT_LOCALE,
  fallbackLocale: DEFAULT_LOCALE,
  messages,
  // A missing key is a bug the parity test catches; never print a warning in the app.
  missingWarn: false,
  fallbackWarn: false,
})

/** `t` for use outside components (format helpers, stores). Reads the live locale. */
export const t = i18n.global.t

export function setI18nLocale(locale: Locale): void {
  i18n.global.locale.value = locale
}

export function currentLocale(): Locale {
  const value: string = i18n.global.locale.value
  return isLocale(value) ? value : DEFAULT_LOCALE
}
