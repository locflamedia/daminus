// The words and numbers of the server page: what each card writes from the models in
// `lib/server-*`, for the language in use. Pure functions of the model and a locale, so the
// rules (what is the big number, how a change reads) are tested without a DOM.
import type { Item } from '@/api'
import { i18n, type Locale } from '@/i18n'
import { formatDate, formatDelta, formatMeasure, formatNumber } from '@/lib/format'
import type { DiskChart, DiskPoint } from '@/lib/server-disk'
import type { Kpi, KpiDelta, DeltaTone } from '@/lib/server-metrics'
import type { SecurityRow } from '@/lib/server-security'
import { deltaTone } from '@/lib/server-metrics'
import type { ChartTip } from '@/ui/UiChartTip.vue'
import type { SparkTone } from '@/ui/UiSparkline.vue'
import type { ChipTone } from '@/ui/UiChip.vue'

function tr(key: string, locale: Locale, params: Record<string, unknown> = {}, plural?: number) {
  const { t } = i18n.global
  return plural === undefined
    ? t(`serverScreen.${key}`, params, { locale })
    : t(`serverScreen.${key}`, params, { locale, plural })
}

export interface KpiView {
  id: Kpi['id']
  label: string
  /** The big number; `null` when there is no value. */
  value: string | null
  /** The small text after it: the unit, or "/ 4 cores". */
  small: string
  /** What the number says about itself ("CPU ≈ 40% busy"), before the change. */
  detail: string
  /** The change since the baseline ("0.12", "3 pts · +2.9 GB"); empty without a baseline. */
  change: string
  glyph: '▲' | '▼' | ''
  /** What the glyph says for a screen reader. */
  glyphWords: string
  tone: DeltaTone
  tag: { text: string; tone: ChipTone }
  spark: { values: number[]; tone: SparkTone }
  /** Why the number is missing (an unknown reason), when it is. */
  reason: string | null
  needsPermission: boolean
  staleSince: number | null
}

const TAG_TONE: Record<Kpi['level'], ChipTone> = {
  ok: 'ok',
  info: 'info',
  warn: 'warn',
  crit: 'crit',
  unknown: 'neutral',
}

function bigNumber(kpi: Kpi, locale: Locale): { value: string | null; small: string } {
  if (kpi.value === null) return { value: null, small: '' }
  if (kpi.unit === 'load') {
    const value = new Intl.NumberFormat(locale, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(kpi.value)
    return { value, small: kpi.of === null ? '' : tr('kpi.ofCores', locale, { n: kpi.of }, kpi.of) }
  }
  if (kpi.unit === 'bytes') {
    const used = formatMeasure(kpi.value, 'bytes', locale)
    if (kpi.of === null) return { value: used.text, small: '' }
    const total = formatMeasure(kpi.of, 'bytes', locale)
    return {
      value: used.unit === total.unit ? used.value : used.text,
      small: tr('kpi.ofSize', locale, { size: total.text }),
    }
  }
  return { value: formatNumber(Math.round(kpi.value), locale), small: '%' }
}

function amountText(delta: KpiDelta, locale: Locale): string {
  if (delta.unit === 'load') {
    return new Intl.NumberFormat(locale, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(delta.amount)
  }
  if (delta.unit === 'bytes') return formatMeasure(delta.amount, 'bytes', locale).text
  const n = Math.round(delta.amount)
  return tr('kpi.pts', locale, { n }, n)
}

function changeText(delta: KpiDelta | null, locale: Locale): string {
  if (!delta) return ''
  if (delta.direction === 'flat') return tr('kpi.same', locale)
  const amount = amountText(delta, locale)
  if (delta.bytes === null || delta.bytes === 0) return amount
  return `${amount} · ${formatDelta(delta.bytes, 'bytes', locale).text}`
}

function detailText(kpi: Kpi, locale: Locale): string {
  const d = kpi.detail
  if (!d) return ''
  if (d.kind === 'busy') return tr('kpi.busy', locale, { pct: d.pct })
  if (d.kind === 'available') return tr('kpi.available', locale, { pct: d.pct })
  return tr('kpi.noSwap', locale)
}

export function kpiLabel(kpi: Kpi, locale: Locale): string {
  if (kpi.id === 'disk') {
    return kpi.mount ? tr('kpi.disk', locale, { mount: kpi.mount }) : tr('kpi.diskBare', locale)
  }
  return tr(`kpi.${kpi.id}`, locale)
}

export function kpiView(kpi: Kpi, locale: Locale): KpiView {
  const { value, small } = bigNumber(kpi, locale)
  const direction = kpi.delta?.direction
  const glyph = direction === 'up' ? '▲' : direction === 'down' ? '▼' : ''
  const stale = kpi.staleSince !== null
  return {
    id: kpi.id,
    label: kpiLabel(kpi, locale),
    value,
    small,
    detail: stale
      ? i18n.global.t('severity.stale', { seq: kpi.staleSince }, { locale })
      : detailText(kpi, locale),
    change: stale ? '' : changeText(kpi.delta, locale),
    glyph: stale ? '' : glyph,
    glyphWords: glyph === '▲' ? tr('kpi.up', locale) : glyph === '▼' ? tr('kpi.down', locale) : '',
    tone: stale ? 'warn' : deltaTone(kpi),
    tag: { text: tr(`kpi.tag.${kpi.level}`, locale), tone: TAG_TONE[kpi.level] },
    spark: {
      values: kpi.series,
      tone: stale
        ? 'stale'
        : kpi.level === 'warn'
          ? 'warn'
          : kpi.level === 'crit'
            ? 'crit'
            : 'accent',
    },
    reason: kpi.reason ? i18n.global.t(`unknown.${kpi.reason}`, {}, { locale }) : null,
    needsPermission: kpi.reason === 'needs_perm',
    staleSince: kpi.staleSince,
  }
}

function signedPts(diff: number, locale: Locale): string {
  const n = Math.round(Math.abs(diff))
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : ''
  return `${sign}${tr('kpi.pts', locale, { n }, n)}`
}

/** Pill of a disk point: the change since the scan before it, with the bytes on the newest. */
function pointDelta(chart: DiskChart, index: number, locale: Locale): string | undefined {
  const point = chart.points[index] as DiskPoint
  const before = chart.points[index - 1]
  if (!before) return undefined
  return signedPts(point.value - before.value, locale)
}

/** The hover card of every disk point; the newest carries the forecast. */
export function diskTips(chart: DiskChart, locale: Locale): ChartTip[] {
  const last = chart.points.length - 1
  return chart.points.map((point, i) => {
    const date = formatDate(point.at, locale)
    const value = `${formatNumber(Math.round(point.value), locale)}%`
    const newest = i === last
    const title = tr(newest ? 'disk.tipNow' : 'disk.tipTitle', locale, { date, seq: point.seq })
    const delta = pointDelta(chart, i, locale)
    const note = newest ? forecastText(chart, locale) : undefined
    return {
      title,
      value,
      ...(delta ? { delta } : {}),
      ...(note ? { note } : {}),
      spoken: [title, value, delta, note].filter(Boolean).join(', '),
    }
  })
}

export function forecastText(chart: DiskChart, locale: Locale): string | undefined {
  const crit = chart.thresholds.crit
  const last = chart.points[chart.points.length - 1]
  if (last && last.value >= crit) return tr('disk.atLimit', locale, { n: crit })
  const days = chart.forecastDays
  return days === null ? undefined : tr('disk.forecast', locale, { n: crit, days }, days)
}

const LEVEL_WORD: Record<string, string> = { new: 'new', fixed: 'fixed', changed: 'changed' }

/** What a finding's second line says besides its check: the value, then how long it has stood. */
export function findingEvidence(item: Item, locale: Locale): string {
  const { t } = i18n.global
  const parts: string[] = []
  const value = item.fact?.value
  if (typeof value === 'number' && Number.isFinite(value)) {
    parts.push(formatMeasure(value, item.fact?.unit, locale).text)
  }
  if (item.disposition.kind === 'stale') {
    parts.push(t('severity.stale', { seq: item.disposition.since_seq }, { locale }))
  } else if (item.severity.level === 'unknown') {
    parts.push(t(`unknown.${item.severity.reason}`, {}, { locale }))
  } else if (item.delta?.kind === 'still') {
    parts.push(
      t('delta.still', { n: item.delta.scans_open }, { locale, plural: item.delta.scans_open }),
    )
  } else if (item.delta && LEVEL_WORD[item.delta.kind]) {
    parts.push(t(`delta.${item.delta.kind}`, {}, { locale }))
  }
  return parts.join(' · ')
}

/** The value written at the end of a security row. */
export function securityValue(row: SecurityRow, locale: Locale): string {
  const d = row.detail
  switch (d.kind) {
    case 'clear':
      return tr(`security.clear.${row.check}`, locale)
    case 'files':
      return tr('security.files', locale, { n: d.n }, d.n)
    case 'found':
      return tr('security.found', locale, { n: d.n })
    case 'seen':
      return d.name
        ? tr('security.seenFound', locale, { name: d.name, seen: d.seen, total: d.total })
        : tr('security.seen', locale, { seen: d.seen, total: d.total })
    case 'reason':
      return i18n.global.t(`unknown.${d.reason}`, {}, { locale })
    case 'off':
      return tr('security.off', locale)
    default:
      return tr('security.none', locale)
  }
}
