// Words for what the core says. The core never returns display text: it sends an
// `ErrorCode`, a `MainIssue` (check id + params) or a `Severity`, and the sentence is
// built here from `src/i18n`, in the current language.
import type { AppError, MainIssue, Severity } from '@/api'
import { currentLocale, i18n, type Locale } from '@/i18n'
import { formatMeasure } from './format'

function numberParam(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function stringParam(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** The sentence for a rejected command. Params carry paths and numbers, never prose. */
export function errorText(error: AppError, locale: Locale = currentLocale()): string {
  const { t } = i18n.global
  const code = error.code
  switch (code.kind) {
    case 'config_invalid':
      return code.line == null
        ? t('error.config_invalid', { path: code.path }, { locale })
        : t('error.config_invalid_at', { path: code.path, line: code.line }, { locale })
    case 'config_from_newer_version':
      return t(
        'error.config_from_newer_version',
        { path: code.path, version: code.version },
        { locale },
      )
    case 'config_changed_on_disk':
      return t('error.config_changed_on_disk', { path: code.path }, { locale })
    case 'io':
      return t('error.io', { path: code.path }, { locale })
    default:
      return t(`error.${code.kind}`, {}, { locale })
  }
}

/** The name of a check (`disk.fs` becomes "Disk space"); the id itself when it has none. */
export function checkName(id: string, locale: Locale = currentLocale()): string {
  const key = `checks.${id}.name`
  return i18n.global.te(key, locale) ? i18n.global.t(key, {}, { locale }) : id
}

/**
 * The one issue a card or row leads with, as a sentence: `MainIssue.key.check` picks the
 * template, `target`, `value` and `unit` fill it. An unknown check gets a plain fallback.
 */
export function issueText(issue: MainIssue, locale: Locale = currentLocale()): string {
  const { t, te } = i18n.global
  const check = issue.key.check
  const value = numberParam(issue.params.value)
  const unit = typeof issue.params.unit === 'string' ? issue.params.unit : null
  const count = value ?? 1
  const named = {
    target: stringParam(issue.params.target) || issue.key.target,
    value: value === undefined ? '' : formatMeasure(value, unit, locale).text,
    n: count,
  }
  const key = `issue.${check}`
  if (!te(key, locale)) return t('issue.fallback', { check: checkName(check, locale) }, { locale })
  return t(key, named, { locale, plural: count })
}

/** The fixed severity words: Critical, Warning, Info, All clear; for unknown, the reason. */
export function severityText(severity: Severity, locale: Locale = currentLocale()): string {
  const { t } = i18n.global
  return severity.level === 'unknown'
    ? t(`unknown.${severity.reason}`, {}, { locale })
    : t(`severity.${severity.level}`, {}, { locale })
}
