// The disk chart of the server page: the fullest filesystem over the last scans on a real
// time axis (scans happen on demand and unevenly), the warn and crit lines the core grades
// with, and the forecast in days. The thresholds are the manifest's own for `disk.fs`.
import type { Item, ScanFact } from '@/api'
import type { SeverityRule } from '@/api/bindings/SeverityRule'
import { checkManifest } from './check-manifest'
import { dataOf, num } from './project-facts'
import { hostSeries } from './server-facts'
import { daysUntil, type TimedValue } from './forecast'
import { formatDate } from './format'
import type { Locale } from '@/i18n'

export interface DiskThresholds {
  warn: number
  crit: number
}

/** Where `disk.fs` starts to warn and to be critical, read from the manifest rule on `data.pct`. */
export function diskThresholds(): DiskThresholds {
  const rule = checkManifest.checks.find((c) => c.id === 'disk.fs')?.rule
  const found = pctRule(rule)
  return { warn: found?.warn ?? 80, crit: found?.crit ?? 90 }
}

function pctRule(rule: SeverityRule | undefined): { warn: number; crit: number | null } | null {
  if (!rule) return null
  if (rule.type === 'threshold') {
    return rule.field === 'data.pct' ? { warn: rule.warn, crit: rule.crit ?? null } : null
  }
  if (rule.type === 'max_of') {
    for (const inner of rule.rules) {
      const hit = pctRule(inner)
      if (hit) return hit
    }
  }
  return null
}

export interface DiskPoint {
  seq: number
  /** When the scan read it, in milliseconds. */
  at: number
  value: number
}

export interface DiskSizes {
  size: number | null
  used: number | null
  avail: number | null
}

export interface DiskChart {
  mount: string
  /** Oldest first. */
  points: DiskPoint[]
  thresholds: DiskThresholds
  domain: [number, number]
  grid: number[]
  /** Whole days until the crit line at the pace of the last scans; `null` when it is not rising. */
  forecastDays: number | null
  sizes: DiskSizes
}

/** How many scans the chart draws. */
export const DISK_SCANS = 10

/** A forecast further out than this is not worth a sentence. */
export const FORECAST_MAX_DAYS = 365

export function asTimed(points: readonly DiskPoint[]): TimedValue[] {
  return points.map((p) => ({ at: p.at, value: p.value }))
}

/** The value axis: from a round value under the lowest reading up to 100. */
export function diskDomain(
  points: readonly DiskPoint[],
  warn: number,
): { domain: [number, number]; grid: number[] } {
  const low = Math.min(...points.map((p) => p.value), warn)
  const floor = Math.max(0, Math.floor((low - 5) / 10) * 10)
  const grid: number[] = []
  for (let v = floor; v < warn; v += 10) grid.push(v)
  return { domain: [floor, 100], grid }
}

/** `null` until the host has two scans of the filesystem to draw. */
export function buildDiskChart(
  item: Item | undefined,
  facts: readonly ScanFact[],
  host: string,
): DiskChart | null {
  if (!item) return null
  const mount = item.key.target
  const points = hostSeries(facts, host, 'disk.fs', 'data.pct', mount)
    .slice(-DISK_SCANS)
    .map((p) => ({ seq: p.seq, at: Date.parse(p.at), value: p.value }))
    .filter((p) => Number.isFinite(p.at))
  if (points.length < 2) return null
  const thresholds = diskThresholds()
  const days = daysUntil(asTimed(points), thresholds.crit)
  const data = dataOf(item.fact)
  return {
    mount,
    points,
    thresholds,
    ...diskDomain(points, thresholds.warn),
    forecastDays: days !== null && days <= FORECAST_MAX_DAYS ? days : null,
    sizes: { size: num(data.size), used: num(data.used), avail: num(data.avail) },
  }
}

export interface AxisTick {
  /** The scan whose position carries the label. */
  index: number
  text: string
  anchor: 'start' | 'middle' | 'end'
}

const DAY_MS = 86_400_000

function sameDay(a: number, b: number): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

/**
 * Labels under the time axis: the first day, three days spread between, and the last, which
 * says "today" when it is. Each label sits at the scan nearest to its moment, and a day is
 * written without its month when the month is the first label's.
 */
export function axisTicks(
  points: readonly DiskPoint[],
  now: number,
  locale: Locale,
  today: string,
): AxisTick[] {
  const first = points[0]
  const last = points[points.length - 1]
  if (!first || !last || points.length < 2) return []
  const span = last.at - first.at
  const nearest = (at: number) =>
    points.reduce(
      (best, p, i) => (Math.abs(p.at - at) < Math.abs((points[best]?.at ?? 0) - at) ? i : best),
      0,
    )
  const ticks: AxisTick[] = [{ index: 0, text: formatDate(first.at, locale), anchor: 'start' }]
  if (span >= 4 * DAY_MS) {
    for (const share of [0.3, 0.5, 0.7]) {
      const index = nearest(first.at + span * share)
      if (index > 0 && index < points.length - 1 && !ticks.some((t) => t.index === index)) {
        const at = points[index]?.at ?? 0
        const sameMonth = new Date(at).getMonth() === new Date(first.at).getMonth()
        ticks.push({
          index,
          text: sameMonth ? String(new Date(at).getDate()) : formatDate(at, locale),
          anchor: 'middle',
        })
      }
    }
  }
  const lastText = formatDate(last.at, locale)
  ticks.push({
    index: points.length - 1,
    text: sameDay(last.at, now) ? `${lastText} · ${today}` : lastText,
    anchor: 'end',
  })
  return ticks
}
