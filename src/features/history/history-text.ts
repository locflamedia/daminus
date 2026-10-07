// The words of the scan history for the language in use: what a column or a row says about a
// scan, so colour and height are never the only signal.
import { i18n, type Locale } from '@/i18n'
import type { IssueCounts } from '@/lib/chart-layout'
import { formatDate, formatDateLong, formatDuration } from '@/lib/format'
import type { ChartTip } from '@/ui/UiChartTip.vue'

function tr(key: string, locale: Locale, params: Record<string, unknown> = {}, plural?: number) {
  const { t } = i18n.global
  return plural === undefined
    ? t(`historyScreen.${key}`, params, { locale })
    : t(`historyScreen.${key}`, params, { locale, plural })
}

/** "2 critical, 4 warnings, 1 info"; zero kinds are left out. */
export function describeCounts(c: IssueCounts, locale: Locale): string {
  const parts = [
    c.crit > 0 && tr('chart.partCrit', locale, { n: c.crit }),
    c.warn > 0 && tr('chart.partWarn', locale, { n: c.warn }, c.warn),
    c.info > 0 && tr('chart.partInfo', locale, { n: c.info }),
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : tr('chart.none', locale)
}

export function issueTotal(c: IssueCounts): number {
  return c.crit + c.warn + c.info
}

/** "62 s" up to ten minutes, then minutes. */
export function scanDuration(ms: number, locale: Locale): string {
  const seconds = Math.round(ms / 1000)
  return seconds < 600 ? tr('list.seconds', locale, { n: seconds }) : formatDuration(ms, locale)
}

/** The hover card and the sentence read out for a column: "Scan 10, 24 September, 6 issues, ...". */
export function columnTip(
  seq: number,
  startedAt: string,
  c: IssueCounts,
  locale: Locale,
): ChartTip {
  const total = issueTotal(c)
  const count = tr('chart.count', locale, { n: total }, total)
  const description = describeCounts(c, locale)
  return {
    title: tr('chart.tipTitle', locale, { date: formatDate(startedAt, locale), seq }),
    value: count,
    spoken: [
      tr('chart.spoken', locale, { seq, date: formatDateLong(startedAt, locale) }),
      count,
      description,
    ].join(', '),
  }
}
