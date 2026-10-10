// "Coming up": what the next days hold, read from what the scans already saved. A disk that
// fills along a straight line (the time axis is the clock, see forecast.ts), expected rules
// whose review date is near, certificates that expire and hosts that have gone quiet. Rows are
// facts; the screen words them.
import { outcomeKey, type OutcomeKey } from '@/lib/outcome-label'
import type { ExpectedRule, Report, ScanFact } from '@/api'
import type { JsonValue } from '@/api/bindings/serde_json/JsonValue'
import { daysUntil, type TimedValue } from './forecast'
import { daysToDay } from './overview-cards'
import {
  CERT_WARN_DAYS,
  COMING_UP_HORIZON_DAYS,
  COMING_UP_SOON_DAYS,
  DISK_FORECAST_LIMIT_PCT,
} from './presentation-hints'
import { isUnreachable } from './rollups'

export type UpcomingKind = 'disk' | 'review' | 'quiet' | 'tls'
export type UpcomingTone = 'warn' | 'info' | 'neutral'

export interface Upcoming {
  id: string
  kind: UpcomingKind
  tone: UpcomingTone
  /** The host, the project or the site the row is about. */
  subject: string
  /** Days ahead (or, for a quiet host, days gone by); `null` when it is not known. */
  days: number | null
  /** For a quiet host: why it could not be scanned. */
  cause?: OutcomeKey
}

/** The most rows the list shows. */
export const UPCOMING_SHOWN = 6

const DAY_MS = 86_400_000
const ORDER: Record<UpcomingKind, number> = { disk: 0, review: 1, quiet: 2, tls: 3 }

function pct(fact: ScanFact): number | null {
  const data = fact.fact.data
  const value =
    typeof data === 'object' && data !== null && !Array.isArray(data) ? data.pct : undefined
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Disks that reach the limit within the horizon, soonest first, one row per host. */
export function diskForecasts(facts: readonly ScanFact[]): Upcoming[] {
  const series = new Map<string, { host: string; points: TimedValue[] }>()
  for (const f of facts) {
    const value = pct(f)
    if (value === null || f.fact.check !== 'disk.fs') continue
    const key = `${f.host}|${f.fact.target}`
    const entry = series.get(key) ?? { host: f.host, points: [] }
    entry.points.push({ at: Date.parse(f.at), value })
    series.set(key, entry)
  }
  const byHost = new Map<string, Upcoming>()
  for (const [key, { host, points }] of series) {
    const last = points[points.length - 1]
    const days = daysUntil(points, DISK_FORECAST_LIMIT_PCT)
    if (!last || days === null || days === 0 || days > COMING_UP_HORIZON_DAYS) continue
    const known = byHost.get(host)
    if (known && (known.days ?? Infinity) <= days) continue
    byHost.set(host, { id: `disk|${key}`, kind: 'disk', tone: 'warn', subject: host, days })
  }
  return [...byHost.values()].sort((a, b) => (a.days ?? 0) - (b.days ?? 0))
}

/** Expected rules still in force whose review day is near; the subject is who owns the result. */
export function ruleReviews(
  rules: readonly ExpectedRule[],
  report: Report,
  now: number,
): Upcoming[] {
  const due = new Set(report.rules_due)
  const owners = new Map<string, string>()
  for (const item of report.items) {
    if (item.disposition.kind !== 'expected') continue
    owners.set(
      item.disposition.rule,
      item.owner.kind === 'project' ? item.owner.id : item.owner.host,
    )
  }
  return rules.flatMap((rule) => {
    if (!rule.until || due.has(rule.id)) return []
    const days = Math.max(0, daysToDay(rule.until, now))
    if (Number.isNaN(days) || days > COMING_UP_SOON_DAYS) return []
    return [
      {
        id: `review|${rule.id}`,
        kind: 'review' as const,
        tone: 'info' as const,
        subject: owners.get(rule.id) ?? rule.host,
        days,
      },
    ]
  })
}

/** Hosts that did not answer the latest scan, with the days since they last did. */
export function quietHosts(report: Report, now: number): Upcoming[] {
  return report.servers.flatMap((s) => {
    if (!s.included || !isUnreachable(s.outcome)) return []
    const age = s.last_reached_at ? Math.floor((now - Date.parse(s.last_reached_at)) / DAY_MS) : NaN
    return [
      {
        id: `quiet|${s.host}`,
        kind: 'quiet' as const,
        tone: 'neutral' as const,
        subject: s.host,
        days: Number.isNaN(age) ? null : Math.max(0, age),
        cause: outcomeKey(s.outcome),
      },
    ]
  })
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

/**
 * Certificates that still hold and expire soon. When none is that close, the one that expires
 * first is still listed, so the row answers "when do I have to look at this next".
 */
export function certificateExpiries(report: Report): Upcoming[] {
  const all = report.items.flatMap((item) => {
    if (item.key.check !== 'url.tls' || item.disposition.kind !== 'active') return []
    const days = item.fact?.value
    const data: JsonValue | undefined = item.fact?.data
    const flagged =
      typeof data === 'object' && data !== null && !Array.isArray(data)
        ? data.expired === true || data.untrusted === true || data.mismatch === true
        : false
    if (typeof days !== 'number' || days < 0 || flagged || item.fact?.unknown) return []
    return [
      {
        id: `tls|${item.key.target}`,
        kind: 'tls' as const,
        tone: days < CERT_WARN_DAYS ? ('warn' as const) : ('neutral' as const),
        subject: hostOf(item.key.target),
        days: Math.round(days),
      },
    ]
  })
  const sorted = [...all].sort((a, b) => (a.days ?? 0) - (b.days ?? 0))
  const soon = sorted.filter((r) => (r.days ?? Infinity) <= COMING_UP_SOON_DAYS)
  return soon.length > 0 ? soon : sorted.slice(0, 1)
}

/** The whole list: forecasts, reviews, quiet hosts, certificates; each group soonest first. */
export function comingUp(
  report: Report,
  rules: readonly ExpectedRule[],
  diskFacts: readonly ScanFact[],
  now: number,
): Upcoming[] {
  return [
    ...diskForecasts(diskFacts),
    ...ruleReviews(rules, report, now).sort((a, b) => (a.days ?? 0) - (b.days ?? 0)),
    ...quietHosts(report, now),
    ...certificateExpiries(report),
  ]
    .sort((a, b) => ORDER[a.kind] - ORDER[b.kind])
    .slice(0, UPCOMING_SHOWN)
}
