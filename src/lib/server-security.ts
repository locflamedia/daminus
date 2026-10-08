// The right column of the server page: the findings of the host (everything that is not ok)
// and "Security lite", the six security checks in one compact list. Severity, expected and
// stale come from the core; this only gathers and orders them.
import type { CheckGroup, Item, Report } from '@/api'
import type { UnknownReason } from '@/api/bindings/UnknownReason'
import { checkManifest } from './check-manifest'
import { dataOf, num, str } from './project-facts'

export type FindingLevel = 'crit' | 'warn' | 'unknown' | 'info'

export interface Finding {
  id: string
  item: Item
  level: FindingLevel
  /** The scan the shown result was last really checked in, when it is old. */
  staleSince: number | null
}

export interface FindingTally {
  crit: number
  warn: number
  info: number
  unknown: number
  expected: number
  ok: number
}

const ORDER: Record<FindingLevel, number> = { crit: 0, warn: 1, unknown: 2, info: 3 }

/** Results of the host that are not ok, worst first, and the count of each kind. */
export function buildFindings(items: readonly Item[]): { rows: Finding[]; tally: FindingTally } {
  const tally: FindingTally = { crit: 0, warn: 0, info: 0, unknown: 0, expected: 0, ok: 0 }
  const rows: Finding[] = []
  for (const item of items) {
    if (item.disposition.kind === 'expected') {
      tally.expected += 1
      continue
    }
    const level = item.severity.level
    if (level === 'ok') {
      tally.ok += 1
      continue
    }
    tally[level] += 1
    rows.push({
      id: `${item.key.check}\u0000${item.key.target}`,
      item,
      level,
      staleSince: item.disposition.kind === 'stale' ? item.disposition.since_seq : null,
    })
  }
  rows.sort(
    (a, b) =>
      ORDER[a.level] - ORDER[b.level] ||
      a.item.key.check.localeCompare(b.item.key.check) ||
      a.item.key.target.localeCompare(b.item.key.target),
  )
  return { rows, tally }
}

export const SECURITY_CHECKS = [
  'sec.miner',
  'sec.preload',
  'sec.tmp_exec',
  'sec.ports',
  'sec.upload_php',
  'sec.recent_change',
] as const

export type SecurityCheck = (typeof SECURITY_CHECKS)[number]
export type SecurityState = 'ok' | 'info' | 'warn' | 'crit' | 'unknown' | 'off' | 'none'

export type SecurityDetail =
  | { kind: 'clear' }
  | { kind: 'files'; n: number }
  | { kind: 'found'; n: number }
  | { kind: 'seen'; seen: number; total: number; name: string | null }
  | { kind: 'reason'; reason: UnknownReason }
  | { kind: 'off' }
  | { kind: 'none' }

export interface SecurityRow {
  check: SecurityCheck
  state: SecurityState
  detail: SecurityDetail
}

function groupOf(check: string): CheckGroup | undefined {
  return checkManifest.checks.find((c) => c.id === check)?.group
}

const RANK: Record<string, number> = { crit: 4, warn: 3, unknown: 2, info: 1, ok: 0 }

function worst(items: readonly Item[]): Item {
  return items.reduce((a, b) =>
    (RANK[b.severity.level] ?? 0) > (RANK[a.severity.level] ?? 0) ? b : a,
  )
}

/** How far the miner check got when it could not look at every process. */
function coverage(item: Item): { seen: number; total: number } | null {
  const data = dataOf(item.fact)
  const seen = num(data.seen)
  const total = num(data.total)
  return seen !== null && total !== null && seen < total ? { seen, total } : null
}

function rowFor(check: SecurityCheck, items: readonly Item[], report: Report | null): SecurityRow {
  const group = groupOf(check)
  if (group && report?.disabled_groups.includes(group)) {
    return { check, state: 'off', detail: { kind: 'off' } }
  }
  const own = items.filter((i) => i.key.check === check && i.disposition.kind !== 'expected')
  if (own.length === 0) return { check, state: 'none', detail: { kind: 'none' } }

  const top = worst(own)
  const level = top.severity.level
  const partial = check === 'sec.miner' ? coverage(top) : null
  if (level === 'unknown' || (level === 'ok' && partial)) {
    const reason = top.severity.level === 'unknown' ? top.severity.reason : 'needs_perm'
    return {
      check,
      state: 'unknown',
      detail: partial ? { kind: 'seen', ...partial, name: null } : { kind: 'reason', reason },
    }
  }
  if (level === 'ok') return { check, state: 'ok', detail: { kind: 'clear' } }
  const found = own.filter((i) => i.severity.level !== 'ok')
  if (check === 'sec.recent_change') {
    const files = found.reduce((sum, i) => sum + (num(i.fact?.value) ?? 0), 0)
    return { check, state: level, detail: { kind: 'files', n: files } }
  }
  if (partial) {
    return {
      check,
      state: level,
      detail: { kind: 'seen', ...partial, name: str(top.key.target) || null },
    }
  }
  return { check, state: level, detail: { kind: 'found', n: found.length } }
}

export interface SecurityLite {
  rows: SecurityRow[]
  /** Checks that answered ok, and checks that answered at all (not off, not missing). */
  clean: number
  counted: number
}

export function buildSecurityLite(items: readonly Item[], report: Report | null): SecurityLite {
  const rows = SECURITY_CHECKS.map((check) => rowFor(check, items, report))
  const counted = rows.filter((r) => r.state !== 'off' && r.state !== 'none').length
  return { rows, clean: rows.filter((r) => r.state === 'ok').length, counted }
}
