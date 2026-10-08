// What the Findings page lists and how its filter cuts it. With an answer, the list is the AI's
// ranking; without one (no provider, nothing asked yet) it is the checks' own list, worst first,
// and says so. Severity is always the check's.
import type { Item, Report } from '@/api'
import { isUnreachable } from '@/lib/rollups'
import { currentLocale, type Locale } from '@/i18n'
import { issueText } from '@/lib/issue-text'
import { toneOf, type FindingTone, type ResolvedFinding } from './resolve-findings'

export type FindingsFilter = 'all' | 'crit' | 'warn'

export function filterCounts(findings: readonly ResolvedFinding[]) {
  return {
    all: findings.length,
    crit: findings.filter((f) => f.tone === 'crit').length,
    warn: findings.filter((f) => f.tone === 'warn').length,
  }
}

export function applyFilter(
  findings: readonly ResolvedFinding[],
  filter: FindingsFilter,
): ResolvedFinding[] {
  return filter === 'all' ? [...findings] : findings.filter((f) => f.tone === filter)
}

const URGENCY: Record<FindingTone, number> = { crit: 0, warn: 1, info: 2, plain: 3 }

/** The checks' own list: critical and warn results that count, worst first, unranked. */
export function fallbackFindings(
  report: Report | null,
  locale: Locale = currentLocale(),
): ResolvedFinding[] {
  const rows = (report?.items ?? [])
    .filter(
      (item: Item) =>
        item.disposition.kind === 'active' &&
        (item.severity.level === 'crit' || item.severity.level === 'warn'),
    )
    .map((item, i) => ({ item, i, tone: toneOf(item.severity) }))
    .sort((a, b) => URGENCY[a.tone] - URGENCY[b.tone] || a.i - b.i)
  return rows.map(({ item, tone }) => ({
    id: `${item.key.host}|${item.key.check}|${item.key.target}`,
    rank: 0,
    why: '',
    command: null,
    item,
    severity: item.severity,
    tone,
    title: issueText({ key: item.key, params: {}, severity: item.severity }, locale),
    owner: item.owner.kind === 'project' ? item.owner.id : item.owner.host,
    where: item.key.target || item.key.host,
  }))
}

export interface FindingsFooter {
  /** Results that are fine and count. */
  passed: number
  /** Results marked as expected. */
  expected: number
  /** Servers the latest scan did not reach (or did not include). */
  unreachable: string[]
}

/** The rows under the list: what the report already knows about everything that is not listed. */
export function footerRows(report: Report | null): FindingsFooter {
  const items = report?.items ?? []
  return {
    passed: items.filter((i) => i.disposition.kind === 'active' && i.severity.level === 'ok')
      .length,
    expected: items.filter((i) => i.disposition.kind === 'expected').length,
    unreachable: (report?.servers ?? [])
      .filter((s) => isUnreachable(s.outcome) || !s.included)
      .map((s) => s.host),
  }
}
