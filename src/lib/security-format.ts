// Small text helpers of the Security tab: a file's time the way the boards write it, and the
// URL of a served file.
import { currentLocale, type Locale } from '@/i18n'
import { formatClock, formatDate } from './format'

/** `24 Sep 02:14`: day, month and clock of a unix time in seconds. */
export function dayTime(seconds: number, locale: Locale = currentLocale()): string {
  const date = new Date(seconds * 1000)
  return `${formatDate(date, locale)} ${formatClock(date, locale)}`
}

/** The address a served file answers at: the site's address and the file's path. */
export function servedUrl(site: string, path: string): string {
  return `${site.replace(/\/+$/, '')}${path}`
}

/** The last segment of a path. */
export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/** Capitalises the first letter, for a list that opens a sentence. */
export function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1)
}
