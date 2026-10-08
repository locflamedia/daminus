// "Checks this scan": the nine checks of the Security tab, one row each, clean ones too, so a
// missing finding is visible and not assumed. A row is the worst result of its check for the
// project; the sentence beside it is a message key plus values, written by the screen.
// Nothing is graded here: severity, expected and stale come from the core's report.
import type { CheckGroup, Item } from '@/api'
import { currentLocale, type Locale } from '@/i18n'
import { formatMeasure } from './format'
import { dataOf, num, str, strings, valueOf } from './security-data'

export const SECURITY_CHECKS = [
  'sec.miner',
  'sec.preload',
  'sec.tmp_exec',
  'sec.upload_php',
  'sec.ports',
  'sec.recent_change',
  'url.http',
  'url.tls',
  'url.exposed',
] as const
export type SecurityCheck = (typeof SECURITY_CHECKS)[number]

/** The Settings group that switches each check on or off. */
export const CHECK_GROUP: Record<SecurityCheck, CheckGroup> = {
  'sec.miner': 'security',
  'sec.preload': 'security',
  'sec.tmp_exec': 'security',
  'sec.upload_php': 'security',
  'sec.ports': 'security',
  'sec.recent_change': 'code_changes',
  'url.http': 'uptime',
  'url.tls': 'uptime',
  'url.exposed': 'security',
}

export function isSecurityCheck(id: string): id is SecurityCheck {
  return (SECURITY_CHECKS as readonly string[]).includes(id)
}

/** The project's results of the nine checks. */
export function securityItems(items: readonly Item[], projectId: string): Item[] {
  return items.filter(
    (i) => i.owner.kind === 'project' && i.owner.id === projectId && isSecurityCheck(i.key.check),
  )
}

export type RowState =
  'crit' | 'warn' | 'info' | 'ok' | 'needs_perm' | 'unknown' | 'expected' | 'off' | 'none'

export interface Msg {
  /** A message key under `projectSecurity.value`. */
  key: string
  params?: Record<string, string | number>
}

export interface SecurityRow {
  id: SecurityCheck
  state: RowState
  /** The bold lead of the right-hand text ("41 of 212"). */
  strong: Msg | null
  value: Msg | null
  /** How many more results the check has for this project than the one shown. */
  more: number
  /** The worst `url.tls` result, drawn as the certificate chip. */
  tls: Item | null
  /** Results of the row that are expected: shown with an "expected" chip. */
  expected: number
  /** The scan the shown result was last really checked in, when it is older than this one. */
  staleSince: number | null
  /** Every result of the check, for the tooltip. */
  items: Item[]
}

const RANK: Record<RowState, number> = {
  crit: 6,
  warn: 5,
  needs_perm: 4,
  unknown: 3,
  info: 2,
  ok: 1,
  expected: 0,
  off: -1,
  none: -2,
}

function stateOf(item: Item): RowState {
  const s = item.severity
  if (s.level !== 'unknown') return s.level
  return s.reason === 'needs_perm' ? 'needs_perm' : 'unknown'
}

/** The worst result first. */
function worstFirst(items: readonly Item[]): Item[] {
  return [...items].sort((a, b) => RANK[stateOf(b)] - RANK[stateOf(a)])
}

/** The miner check answered "none" but did not look at every process: that is not "none". */
function partialClear(id: SecurityCheck, item: Item, state: RowState): boolean {
  if (id !== 'sec.miner' || state !== 'ok') return false
  const data = dataOf(item)
  const seen = num(data.seen)
  const total = num(data.total)
  return seen !== undefined && total !== undefined && seen < total
}

function minerValue(item: Item, state: RowState): Pick<SecurityRow, 'strong' | 'value'> {
  const data = dataOf(item)
  const seen = num(data.seen)
  const total = num(data.total)
  const partial = seen !== undefined && total !== undefined && seen < total
  if (state === 'needs_perm') {
    return {
      strong:
        seen !== undefined && total !== undefined
          ? { key: 'seenOf', params: { seen, total } }
          : null,
      value: { key: 'needsPermission' },
    }
  }
  if (state === 'crit') {
    const name = item.key.target || str(data.exe) || ''
    return {
      strong: null,
      value:
        partial && seen !== undefined && total !== undefined
          ? { key: 'minerFoundPartial', params: { name, seen, total } }
          : { key: 'minerFound', params: { name } },
    }
  }
  return {
    strong: null,
    value:
      seen !== undefined && total !== undefined
        ? { key: 'noneSeen', params: { seen, total } }
        : { key: 'none' },
  }
}

function countFiles(items: readonly Item[]): number {
  // One fact per listed file, at most 50 a folder; `total` is what the check found in the
  // folder and every fact of that folder carries it, so it is counted once per folder.
  const folders = new Map<string, { total: number; listed: number }>()
  for (const item of items) {
    if ((valueOf(item) ?? 0) <= 0) continue
    const key = `${item.key.host}\0${folderGuess(item.key.target)}`
    const seen = folders.get(key) ?? { total: 0, listed: 0 }
    folders.set(key, {
      total: Math.max(seen.total, num(dataOf(item).total) ?? 0),
      listed: seen.listed + 1,
    })
  }
  let n = 0
  for (const { total, listed } of folders.values()) n += Math.max(total, listed)
  return n
}

/** The folder a result path sits in, by its first `uploads` or `storage` segment. */
function folderGuess(path: string): string {
  const cut = path.search(/\/(?:uploads|storage)\//)
  return cut > 0 ? path.slice(0, cut) : path.slice(0, Math.max(0, path.lastIndexOf('/')))
}

function httpValue(item: Item, locale: Locale): Msg {
  const data = dataOf(item)
  const status = num(data.status)
  const ms = valueOf(item)
  const text = ms === undefined ? '' : formatMeasure(ms, 'ms', locale).text
  if (data.class === 'error' || (status === undefined && ms === undefined)) {
    return { key: 'httpDown', params: { why: str(data.error) ?? 'other' } }
  }
  return status !== undefined && text
    ? { key: 'http', params: { status, time: text } }
    : { key: 'httpStatus', params: { status: status ?? 0 } }
}

function exposedFiles(item: Item): string[] {
  const names = strings(dataOf(item).matched_keys).map((k) => k.split(':')[0] ?? '')
  return [...new Set(names.filter(Boolean))]
}

function portsValue(items: readonly Item[]): Msg {
  const ports = [
    ...new Set(
      items
        .map((i) => num(dataOf(i).port) ?? Number(i.key.target.split(':').pop()))
        .filter((p) => Number.isFinite(p) && p > 0),
    ),
  ]
  return { key: 'portsPublic', params: { ports: ports.slice(0, 3).join(', ') } }
}

/** The right-hand text of a row, from the results that decide it. */
function describe(
  id: SecurityCheck,
  state: RowState,
  deciding: readonly Item[],
  locale: Locale,
): Pick<SecurityRow, 'strong' | 'value'> {
  const worst = deciding[0]
  if (!worst) return { strong: null, value: null }
  if (state === 'needs_perm' || state === 'unknown') {
    if (id === 'sec.miner') return minerValue(worst, state)
    const reason = worst.severity.level === 'unknown' ? worst.severity.reason : 'missing'
    return {
      strong: null,
      value:
        state === 'needs_perm'
          ? { key: 'needsPermission' }
          : { key: 'unknownReason', params: { reason } },
    }
  }
  const clean = state === 'ok'
  switch (id) {
    case 'sec.miner':
      return minerValue(worst, state)
    case 'sec.preload': {
      const n = num(dataOf(worst).entries) ?? valueOf(worst) ?? 0
      return { strong: null, value: clean ? { key: 'empty' } : { key: 'libraries', params: { n } } }
    }
    case 'sec.tmp_exec':
    case 'sec.upload_php': {
      const n = countFiles(deciding)
      return {
        strong: null,
        value: clean || n === 0 ? { key: 'none' } : { key: 'files', params: { n } },
      }
    }
    case 'sec.ports':
      return {
        strong: null,
        value: clean ? { key: 'none' } : portsValue(deciding.filter((i) => stateOf(i) === state)),
      }
    case 'sec.recent_change': {
      const n = deciding.reduce((sum, i) => sum + (valueOf(i) ?? 0), 0)
      return {
        strong: null,
        value: n === 0 ? { key: 'none' } : { key: 'filesChanged', params: { n } },
      }
    }
    case 'url.http':
      return { strong: null, value: httpValue(worst, locale) }
    case 'url.tls':
      return { strong: null, value: null }
    case 'url.exposed': {
      const files = exposedFiles(worst)
      return {
        strong: null,
        value:
          clean || files.length === 0
            ? { key: 'none' }
            : { key: 'served', params: { file: files.join(' + ') } },
      }
    }
  }
}

function itemsOf(items: readonly Item[], id: SecurityCheck): Item[] {
  return items.filter((i) => i.key.check === id)
}

/** One row. `disabled` are the groups switched off in Settings. */
export function securityRow(
  id: SecurityCheck,
  items: readonly Item[],
  disabled: readonly CheckGroup[],
  seq: number | null,
  locale: Locale = currentLocale(),
): SecurityRow {
  const own = itemsOf(items, id)
  const base: SecurityRow = {
    id,
    state: 'none',
    strong: null,
    value: null,
    more: 0,
    tls: null,
    expected: 0,
    staleSince: null,
    items: own,
  }
  if (disabled.includes(CHECK_GROUP[id])) return { ...base, state: 'off' }
  if (own.length === 0) return base

  const active = own.filter((i) => i.disposition.kind !== 'expected')
  const expected = own.length - active.length
  if (active.length === 0) {
    const shown = worstFirst(own)
    return {
      ...base,
      state: 'expected',
      expected,
      ...describeExpected(id, shown, locale),
      more: Math.max(0, own.length - 1),
    }
  }
  const ordered = worstFirst(active)
  const worst = ordered[0] as Item
  const state = partialClear(id, worst, stateOf(worst)) ? 'needs_perm' : stateOf(worst)
  const deciding = ordered.filter(
    (i) => stateOf(i) === stateOf(worst) || id === 'sec.upload_php' || id === 'sec.tmp_exec',
  )
  const stale = worst.disposition.kind === 'stale' ? worst.disposition.since_seq : null
  return {
    ...base,
    state,
    ...describe(id, state, deciding.length > 0 ? deciding : ordered, locale),
    more:
      id === 'url.http' || id === 'url.tls' || id === 'url.exposed'
        ? Math.max(0, active.length - 1)
        : 0,
    tls: id === 'url.tls' ? tlsWorst(active) : null,
    expected,
    staleSince: stale !== null && (seq === null || stale < seq) ? stale : null,
  }
}

function describeExpected(id: SecurityCheck, shown: readonly Item[], locale: Locale) {
  const state = stateOf(shown[0] as Item)
  return describe(id, state === 'ok' ? 'warn' : state, shown, locale)
}

/** The certificate that needs the most attention: unchecked and flagged before days, fewest days first. */
function tlsWorst(items: readonly Item[]): Item | null {
  const ranked = [...items].sort((a, b) => {
    const level = RANK[stateOf(b)] - RANK[stateOf(a)]
    if (level !== 0) return level
    return (valueOf(a) ?? Infinity) - (valueOf(b) ?? Infinity)
  })
  return ranked[0] ?? null
}

/** All nine rows, in the board's order. */
export function securityRows(
  items: readonly Item[],
  disabled: readonly CheckGroup[],
  seq: number | null,
  locale: Locale = currentLocale(),
): SecurityRow[] {
  return SECURITY_CHECKS.map((id) => securityRow(id, items, disabled, seq, locale))
}

export interface SeverityMix {
  crit: number
  warn: number
  info: number
  ok: number
}

/** The rows by level, for the bar beside "critical": checks that gave no answer are not counted. */
export function severityMix(rows: readonly SecurityRow[]): SeverityMix {
  const mix: SeverityMix = { crit: 0, warn: 0, info: 0, ok: 0 }
  for (const row of rows) {
    if (row.state === 'crit') mix.crit += 1
    else if (row.state === 'warn') mix.warn += 1
    else if (row.state === 'info') mix.info += 1
    else if (row.state === 'ok') mix.ok += 1
  }
  return mix
}

/** The `url.tls` results that need a detail line under the row (anything but a healthy certificate). */
export function tlsNeedingDetail(row: SecurityRow): Item[] {
  return row.items.filter((i) => i.disposition.kind !== 'expected' && !(i.severity.level === 'ok'))
}
