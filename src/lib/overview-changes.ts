// "Changes since #n": the latest report against the baseline scan, as plain rows. What counts
// as a change comes from facts the core already graded (a result that is new, fixed or changed
// level) plus the things a person wants to know that the grade does not say: a size that grew,
// an image that moved to another tag, a certificate that was renewed, a host that came back or
// went quiet. Rows are facts; the screen words them.
import type { Item, Level, MainIssue, Report, Severity } from '@/api'
import type { JsonValue } from '@/api/bindings/serde_json/JsonValue'
import { NOTABLE_GROWTH } from './overview-cards'
import { isUnreachable } from './rollups'

export type ChangeKind =
  | 'new'
  | 'worse'
  | 'better'
  | 'fixed'
  | 'grew'
  | 'table'
  | 'image'
  | 'renewed'
  | 'online'
  | 'offline'

export type ChangeTone = 'crit' | 'warn' | 'info' | 'ok' | 'neutral'

export interface Change {
  id: string
  kind: ChangeKind
  tone: ChangeTone
  /** The project or server the result belongs to. */
  owner: string
  /** The check id; empty for a host change. */
  check: string
  target: string
  /** The issue to word, for a result that is new, worse, better or fixed. */
  issue?: MainIssue
  bytes?: number
  from?: string
  to?: string
  days?: number
  level?: Level
}

/** How many rows the list shows; the rest is counted. */
export const CHANGES_SHOWN = 8

/** A certificate that gains this many days between scans was renewed. */
const RENEWED_BY_DAYS = 30
const RANK: Record<ChangeKind, number> = {
  new: 0,
  worse: 1,
  grew: 2,
  table: 3,
  image: 4,
  better: 5,
  fixed: 6,
  renewed: 7,
  online: 8,
  offline: 0.5,
}

type Rec = Record<string, JsonValue>

function record(value: JsonValue | undefined): Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {}
}

function ownerOf(item: Item): string {
  return item.owner.kind === 'project' ? item.owner.id : item.owner.host
}

function keyOf(item: Pick<Item, 'key'>): string {
  return `${item.key.host}|${item.key.check}|${item.key.target}`
}

function levelOf(severity: Severity): Level | null {
  return severity.level === 'unknown' ? null : severity.level
}

function asIssue(item: Item): MainIssue {
  const fact = item.fact
  return {
    key: item.key,
    severity: item.severity,
    params: {
      target: item.key.target,
      ...(typeof fact?.value === 'number' ? { value: fact.value } : {}),
      ...(fact?.unit ? { unit: fact.unit } : {}),
    },
  }
}

function open(item: Item): boolean {
  return item.disposition.kind === 'active'
}

function fromDelta(item: Item): Change | null {
  const delta = item.delta
  const level = levelOf(item.severity)
  if (!delta || !open(item)) return null
  const base = { owner: ownerOf(item), check: item.key.check, target: item.key.target }
  if (delta.kind === 'new' && (level === 'crit' || level === 'warn')) {
    return {
      ...base,
      id: `new|${keyOf(item)}`,
      kind: 'new',
      tone: level,
      issue: asIssue(item),
      level,
    }
  }
  if (delta.kind === 'fixed') {
    return { ...base, id: `fixed|${keyOf(item)}`, kind: 'fixed', tone: 'ok', issue: asIssue(item) }
  }
  if (delta.kind === 'changed') {
    const from = levelOf(delta.from)
    const to = levelOf(delta.to)
    const rank = (l: Level | null) => ({ crit: 3, warn: 2, info: 1, ok: 0 })[l ?? 'ok']
    if (to === null || rank(to) === rank(from)) return null
    const worse = rank(to) > rank(from)
    return {
      ...base,
      id: `changed|${keyOf(item)}`,
      kind: worse ? 'worse' : 'better',
      tone: worse ? (to === 'crit' ? 'crit' : 'warn') : 'ok',
      issue: asIssue(item),
      level: to,
    }
  }
  return null
}

/** Sizes that grew by a notable share: folders, databases, Docker storage. */
function growth(item: Item, before: Item | undefined): Change | null {
  const check = item.key.check
  if (!['disk.path', 'db.size', 'docker.df'].includes(check)) return null
  const now = item.fact?.value
  const was = before?.fact?.value
  if (typeof now !== 'number' || typeof was !== 'number' || was <= 0) return null
  if ((now - was) / was < NOTABLE_GROWTH || item.disposition.kind !== 'active') return null
  return {
    id: `grew|${keyOf(item)}`,
    kind: 'grew',
    tone: 'warn',
    owner: ownerOf(item),
    check,
    target: item.key.target,
    bytes: now - was,
  }
}

function tops(item: Item | undefined): Map<string, number> {
  const list = record(item?.fact?.data).top
  const out = new Map<string, number>()
  if (!Array.isArray(list)) return out
  for (const row of list) {
    if (Array.isArray(row) && typeof row[0] === 'string' && typeof row[1] === 'number') {
      out.set(row[0], row[1])
    }
  }
  return out
}

/** The table that grew the most inside a database whose size grew. */
function tableGrowth(item: Item, before: Item | undefined): Change | null {
  if (item.key.check !== 'db.size' || !before) return null
  const was = tops(before)
  let best: { name: string; delta: number } | null = null
  for (const [name, size] of tops(item)) {
    const prior = was.get(name)
    if (prior === undefined || prior <= 0) continue
    const delta = size - prior
    if (delta / prior >= NOTABLE_GROWTH && (!best || delta > best.delta)) best = { name, delta }
  }
  if (!best) return null
  return {
    id: `table|${keyOf(item)}|${best.name}`,
    kind: 'table',
    tone: 'warn',
    owner: ownerOf(item),
    check: 'db.size',
    target: best.name,
    bytes: best.delta,
  }
}

function images(item: Item): Map<string, string> {
  const services = record(item.fact?.data).services
  const out = new Map<string, string>()
  if (!Array.isArray(services)) return out
  for (const s of services) {
    const image = record(s as JsonValue).image
    if (typeof image !== 'string') continue
    const at = image.lastIndexOf(':')
    // A registry port (`host:5000/app`) is not a tag.
    if (at > 0 && !image.slice(at).includes('/')) out.set(image.slice(0, at), image.slice(at + 1))
  }
  return out
}

function imageChanges(item: Item, before: Item | undefined): Change[] {
  if (item.key.check !== 'docker.compose' || !before) return []
  const was = images(before)
  return [...images(item)].flatMap(([name, tag]) => {
    const prior = was.get(name)
    if (prior === undefined || prior === tag) return []
    return [
      {
        id: `image|${keyOf(item)}|${name}`,
        kind: 'image' as const,
        tone: 'info' as const,
        owner: ownerOf(item),
        check: 'docker.compose',
        target: name,
        from: prior,
        to: tag,
      },
    ]
  })
}

function renewed(item: Item, before: Item | undefined): Change | null {
  if (item.key.check !== 'url.tls') return null
  const now = item.fact?.value
  const was = before?.fact?.value
  if (typeof now !== 'number' || typeof was !== 'number' || now - was < RENEWED_BY_DAYS) return null
  return {
    id: `renewed|${keyOf(item)}`,
    kind: 'renewed',
    tone: 'ok',
    owner: ownerOf(item),
    check: 'url.tls',
    target: item.key.target,
    days: Math.round(now),
  }
}

function hostChanges(report: Report, baseline: Report): Change[] {
  return report.servers.flatMap((s) => {
    const before = baseline.servers.find((b) => b.host === s.host)
    if (!before || !s.included || !before.included) return []
    const now = isUnreachable(s.outcome)
    const was = isUnreachable(before.outcome)
    if (now === was) return []
    return [
      {
        id: `${now ? 'offline' : 'online'}|${s.host}`,
        kind: now ? ('offline' as const) : ('online' as const),
        tone: now ? ('warn' as const) : ('ok' as const),
        owner: s.host,
        check: '',
        target: '',
      },
    ]
  })
}

/** Every change from `baseline` to `report`, the most important first. */
export function diffReports(report: Report, baseline: Report | null): Change[] {
  if (!baseline) return []
  const before = new Map(baseline.items.map((i) => [keyOf(i), i]))
  const rows: Change[] = []
  for (const item of report.items) {
    const prior = before.get(keyOf(item))
    const found = [
      fromDelta(item),
      growth(item, prior),
      tableGrowth(item, prior),
      renewed(item, prior),
      ...imageChanges(item, prior),
    ]
    rows.push(...found.filter((c): c is Change => c !== null))
  }
  rows.push(...hostChanges(report, baseline))
  // A certificate the core calls fixed because it was renewed is one row, the renewal.
  const renewals = new Set(rows.filter((c) => c.kind === 'renewed').map((c) => c.target))
  return rows
    .filter((c) => !(c.kind === 'fixed' && c.check === 'url.tls' && renewals.has(c.target)))
    .filter((c, i, all) => all.findIndex((o) => o.id === c.id) === i)
    .sort((a, b) => RANK[a.kind] - RANK[b.kind] || a.owner.localeCompare(b.owner))
}
