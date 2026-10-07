// Number, unit, date and relative-time formatting per locale. The core sends `value + unit`
// and ISO timestamps; everything the user reads is built here (en and vi switch live).
// Rules from the Typography board: tabular figures, three significant digits (8.43 GB,
// 186 MB), a space before the unit, a 24-hour clock, deltas always signed.
import { currentLocale, i18n, type Locale } from '@/i18n'

export interface Measure {
  /** The number, in the locale's own digits and separators. */
  value: string
  /** The unit as shown (`GB`, `ms`, `%`); empty for plain numbers. */
  unit: string
  /** `value` and `unit` joined the way they read: `8.43 GB`, `92%`. */
  text: string
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const

function unitLabel(key: string, locale: Locale): string {
  return i18n.global.t(`units.${key}`, {}, { locale })
}

function number(n: number, locale: Locale, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale, options).format(n)
}

/** A plain number to three significant digits. */
export function formatNumber(n: number, locale: Locale = currentLocale()): string {
  return number(n, locale, { maximumSignificantDigits: 3 })
}

function join(value: string, unit: string, tight = false): Measure {
  return { value, unit, text: unit === '' ? value : tight ? `${value}${unit}` : `${value} ${unit}` }
}

/** Splits bytes into a scaled number and its unit. Steps of 1024, as `df` and `du` count. */
function scaleBytes(bytes: number): { n: number; unit: string } {
  let n = bytes
  let i = 0
  while (Math.abs(n) >= 1024 && i < BYTE_UNITS.length - 1) {
    n /= 1024
    i += 1
  }
  return { n, unit: BYTE_UNITS[i] ?? 'B' }
}

function durationMeasure(ms: number, locale: Locale): Measure {
  const abs = Math.abs(ms)
  if (abs < 1000) return join(number(ms, locale, { maximumFractionDigits: 0 }), 'ms')
  if (abs < 60_000) {
    return join(number(ms / 1000, locale, { maximumFractionDigits: 1 }), unitLabel('s', locale))
  }
  if (abs < 3_600_000) {
    return join(number(ms / 60_000, locale, { maximumFractionDigits: 0 }), unitLabel('min', locale))
  }
  if (abs < 86_400_000) {
    return join(
      number(ms / 3_600_000, locale, { maximumFractionDigits: 0 }),
      unitLabel('h', locale),
    )
  }
  return join(number(ms / 86_400_000, locale, { maximumFractionDigits: 0 }), unitLabel('d', locale))
}

/**
 * Formats a check value by its unit: `bytes`, `%`, `ms`, `count`, `load`, `files`, `days`.
 * A unit it does not know is printed as it came, after the number.
 */
export function formatMeasure(
  value: number,
  unit: string | null | undefined,
  locale: Locale = currentLocale(),
  options: Intl.NumberFormatOptions = {},
): Measure {
  switch (unit) {
    case 'bytes': {
      const { n, unit: label } = scaleBytes(value)
      return join(number(n, locale, { maximumSignificantDigits: 3, ...options }), label)
    }
    case '%':
      return join(number(value, locale, { maximumFractionDigits: 0, ...options }), '%', true)
    case 'ms':
      return Math.abs(value) >= 1000
        ? durationMeasure(value, locale)
        : join(number(value, locale, { maximumFractionDigits: 0, ...options }), 'ms')
    case 'days':
      return join(
        number(value, locale, { maximumFractionDigits: Math.abs(value) < 10 ? 1 : 0, ...options }),
        unitLabel('d', locale),
      )
    case 'files':
      return join(
        number(value, locale, { maximumFractionDigits: 0, ...options }),
        unitLabel('files', locale),
      )
    case 'count':
    case 'load':
    case null:
    case undefined:
    case '':
      return join(number(value, locale, { maximumSignificantDigits: 3, ...options }), '')
    default:
      return join(number(value, locale, { maximumSignificantDigits: 3, ...options }), unit)
  }
}

/**
 * Like `formatMeasure`, always with a sign: `+1.1 GB`, `−0.4 GB`, `+3`. Zero stays unsigned. A
 * drop is written with a true minus sign, as the boards do, not the hyphen of the keyboard.
 */
export function formatDelta(
  value: number,
  unit: string | null | undefined,
  locale: Locale = currentLocale(),
): Measure {
  const measure = formatMeasure(value, unit, locale, { signDisplay: 'exceptZero' })
  const minus = (text: string) => text.replace(/^-/, '\u2212')
  return { ...measure, value: minus(measure.value), text: minus(measure.text) }
}

/** A duration the way the boards write it: `212 ms`, `0.8 s`, `14.8 s`, `37 min`, `41 d`. */
export function formatDuration(ms: number, locale: Locale = currentLocale()): string {
  return durationMeasure(ms, locale).text
}

type DateLike = string | number | Date

function toDate(value: DateLike): Date {
  return value instanceof Date ? value : new Date(value)
}

/** 24-hour clock time in the local zone: `13:42`. */
export function formatClock(value: DateLike, locale: Locale = currentLocale()): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(toDate(value))
}

/** Day then month in English, built from parts: `en-GB` would spell September "Sept". */
function dayMonth(date: Date, month: 'short' | 'long'): string {
  const parts = new Intl.DateTimeFormat('en-US', { month, day: 'numeric' }).formatToParts(date)
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${part('day')} ${part('month')}`
}

/** A day without a year, day first as the boards write it: `26 Sep` in English, `26/9` in Vietnamese. */
export function formatDate(value: DateLike, locale: Locale = currentLocale()): string {
  const date = toDate(value)
  if (locale === 'en') return dayMonth(date, 'short')
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'numeric' }).format(date)
}

/** A day with its month in full, for a sentence read out: `24 September`, `24 tháng 9`. */
export function formatDateLong(value: DateLike, locale: Locale = currentLocale()): string {
  const date = toDate(value)
  if (locale === 'en') return dayMonth(date, 'long')
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(date)
}

/** The full date and time for a tooltip: `26 Sep 2026, 11:58`. */
export function formatDateTime(value: DateLike, locale: Locale = currentLocale()): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    hourCycle: 'h23',
  }).format(toDate(value))
}

/** Weekday, day, month and clock of an older scan: `Sun 22 Sep 21:10`. */
export function formatWeekdayDateTime(value: DateLike, locale: Locale = currentLocale()): string {
  const date = toDate(value)
  const weekday = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : locale, {
    weekday: 'short',
  }).format(date)
  return `${weekday} ${formatDate(date, locale)} ${formatClock(date, locale)}`
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** Whole calendar days from `then` to `now` in the local zone (0 = the same day). */
function calendarDaysAgo(then: Date, now: Date): number {
  return Math.round((startOfDay(now) - startOfDay(then)) / 86_400_000)
}

export interface WhenOptions {
  /** Say `today 13:42` instead of just `13:42` (toolbar meta lines). */
  withToday?: boolean
}

/**
 * Relative under an hour, clock time today, `yesterday 18:40`, then day counts:
 * `just now`, `2 min ago`, `11:58`, `yesterday 18:40`, `3 d ago`.
 */
export function formatWhen(
  value: DateLike,
  now: DateLike = Date.now(),
  locale: Locale = currentLocale(),
  { withToday = false }: WhenOptions = {},
): string {
  const { t } = i18n.global
  const then = toDate(value)
  const current = toDate(now)
  const seconds = (current.getTime() - then.getTime()) / 1000
  if (Math.abs(seconds) < 60) return t('time.justNow', {}, { locale })
  if (seconds >= 60 && seconds < 3600) {
    return t(
      'time.minAgo',
      { n: Math.floor(seconds / 60) },
      { locale, plural: Math.floor(seconds / 60) },
    )
  }
  const days = calendarDaysAgo(then, current)
  const time = formatClock(then, locale)
  if (days === 0) return withToday ? t('time.today', { time }, { locale }) : time
  if (days === 1) return t('time.yesterday', { time }, { locale })
  if (days > 1) return t('time.daysAgo', { n: days }, { locale })
  return `${formatDate(then, locale)} ${time}`
}
