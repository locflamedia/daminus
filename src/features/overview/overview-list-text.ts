// The rows of "Changes since #n" and "Coming up" as sentences: the facts come from
// `lib/overview-changes` and `lib/overview-coming-up`, the words from the messages.
import { currentLocale, i18n } from '@/i18n'
import { formatDelta, formatMeasure } from '@/lib/format'
import { checkName, issueText } from '@/lib/issue-text'
import type { Change, ChangeTone } from '@/lib/overview-changes'
import type { Upcoming } from '@/lib/overview-coming-up'
import { DISK_FORECAST_LIMIT_PCT } from '@/lib/presentation-hints'

type Params = Record<string, string | number>

function t(key: string, params: Params = {}, plural?: number): string {
  const locale = currentLocale()
  return plural === undefined
    ? i18n.global.t(key, params, { locale })
    : i18n.global.t(key, params, { locale, plural })
}

export interface ChangeRow {
  id: string
  tone: ChangeTone
  /** The glyph in the square: ! for critical, ▲ for a warning, ↻ for a move, ✓ for good news. */
  glyph: string
  text: string
  value: string
}

const GLYPH: Record<ChangeTone, string> = { crit: '!', warn: '▲', info: '↻', ok: '✓', neutral: '•' }

function short(target: string): string {
  try {
    return new URL(target).hostname
  } catch {
    return target
  }
}

function sizeSubject(change: Change): string {
  if (change.check === 'docker.df') return t('overviewScreen.changes.docker')
  if (change.check === 'db.size')
    return t('overviewScreen.changes.database', { target: change.target })
  return t('overviewScreen.changes.disk', { target: change.target })
}

function textOf(change: Change): string {
  const { owner } = change
  const row = (what: string) => t('overviewScreen.changes.row', { owner, what })
  switch (change.kind) {
    case 'new':
    case 'worse':
    case 'better':
      return change.issue ? row(issueText(change.issue)) : row(checkName(change.check))
    case 'fixed':
      return row(`${checkName(change.check)} ${short(change.target)}`.trim())
    case 'grew':
      return row(sizeSubject(change))
    case 'table':
      return row(t('overviewScreen.changes.table', { table: change.target }))
    case 'image':
      return t('overviewScreen.changes.image', { name: change.target })
    case 'renewed':
      return t('overviewScreen.changes.renewed', { host: short(change.target) })
    case 'online':
      return t('overviewScreen.changes.online', { host: owner })
    case 'offline':
      // Only the network reads "not answering"; any other cause is named.
      return change.cause && change.cause !== 'unreachable'
        ? row(t(`outcome.${change.cause}`))
        : t('overviewScreen.changes.offline', { host: owner })
  }
}

function valueOf(change: Change): string {
  switch (change.kind) {
    case 'grew':
    case 'table':
      return formatDelta(change.bytes ?? 0, 'bytes').text
    case 'image':
      return `${change.from ?? ''} → ${change.to ?? ''}`
    case 'renewed':
      return formatMeasure(change.days ?? 0, 'days').text
    case 'online':
      return t('overviewScreen.changes.value.up')
    case 'offline':
      return t('overviewScreen.changes.value.down')
    default:
      return t(`overviewScreen.changes.value.${change.kind}`)
  }
}

export function changeRow(change: Change): ChangeRow {
  return {
    id: change.id,
    tone: change.tone,
    glyph: GLYPH[change.tone],
    text: textOf(change),
    value: valueOf(change),
  }
}

export interface UpcomingRow {
  id: string
  tone: Upcoming['tone']
  text: string
  value: string
}

function upcomingText(row: Upcoming): string {
  switch (row.kind) {
    case 'disk':
      return t('overviewScreen.coming.disk', { host: row.subject, pct: DISK_FORECAST_LIMIT_PCT })
    case 'review':
      return t('overviewScreen.coming.review', { subject: row.subject })
    case 'quiet':
      return row.cause && row.cause !== 'unreachable'
        ? t('overviewScreen.coming.cause', { host: row.subject, cause: t(`outcome.${row.cause}`) })
        : t('overviewScreen.coming.quiet', { host: row.subject })
    case 'tls':
      return t('overviewScreen.coming.tls', { host: row.subject })
  }
}

function upcomingValue(row: Upcoming): string {
  const n = row.days
  if (n === null) return ''
  switch (row.kind) {
    case 'disk':
      return t('overviewScreen.coming.inApprox', { n }, n)
    case 'review':
      return n === 0
        ? t('overviewScreen.coming.today')
        : t('overviewScreen.coming.inDays', { n }, n)
    case 'quiet':
      return t('overviewScreen.coming.forDays', { n }, n)
    case 'tls':
      return t('overviewScreen.coming.days', { n }, n)
  }
}

export function upcomingRow(row: Upcoming): UpcomingRow {
  return { id: row.id, tone: row.tone, text: upcomingText(row), value: upcomingValue(row) }
}
