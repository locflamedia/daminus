// The Overview tab's model: the four numbers, the parts of the project and how they are wired,
// what needs a look, and the response strip. Everything is read from the latest report, the saved
// project and the facts of past scans; severity, delta and staleness are the core's.
import type { Component, HistoryView, Item, Level, MainIssue, Project, ScanFact } from '@/api'
import { brandOfEngine, brandOfKind, type BrandName } from '@/ui/brand-marks'
import { dataOf, isRecord, itemsOf, num, str } from './project-facts'
import { parseCompose, parsePm2 } from './project-containers'
import { parseDb } from './project-database'
import { factsFor, lastPoints, median, valueSeries } from './project-series'

export type NodeTone = 'ok' | 'warn' | 'crit' | 'unknown'
export type SparkLine = 'accent' | 'warn' | 'crit' | 'stale'

/** How an item reads as a state dot: its own level; no answer is a hollow dot. */
export function toneOf(item: Item | undefined): NodeTone {
  if (!item) return 'unknown'
  switch (item.severity.level) {
    case 'crit':
      return 'crit'
    case 'warn':
      return 'warn'
    case 'unknown':
      return 'unknown'
    default:
      return 'ok'
  }
}

function lineTone(items: readonly Item[]): SparkLine {
  if (items.some((i) => i.severity.level === 'crit')) return 'crit'
  if (items.some((i) => i.severity.level === 'warn')) return 'warn'
  if (items.length > 0 && items.every((i) => i.disposition.kind === 'stale')) return 'stale'
  return 'accent'
}

export type TileId = 'uptime' | 'disk' | 'database' | 'tls'

export interface OverviewTile {
  id: TileId
  /** Unit of `value`, as the core names it: `ms`, `bytes`, `days`. */
  unit: 'ms' | 'bytes' | 'days'
  /** `null` when nothing answered: no part of that kind, or it needs permission. */
  value: number | null
  /** Change since the previous scan, in `unit`; `null` when there is no previous reading. */
  delta: number | null
  series: number[]
  tone: SparkLine
  /** Why there is no value: not set up, or the reason the core gave. */
  empty: 'none' | 'needs_perm' | 'other' | null
  /** The HTTP status code on the right of the label (200); `null` when there is none. */
  status: number | null
  /** The certificate was renewed inside the window the sparkline covers (days jumped up). */
  renewed: boolean
  item?: Item
}

const NINE = 9

function seqSums(
  facts: readonly ScanFact[],
  matches: { check: string; host: string; target: string }[],
) {
  const by = new Map<number, number>()
  for (const m of matches) {
    for (const p of valueSeries(factsFor(facts, m))) by.set(p.seq, (by.get(p.seq) ?? 0) + p.value)
  }
  return [...by].sort((a, b) => a[0] - b[0]).map(([, v]) => v)
}

function emptyOf(items: readonly Item[]): OverviewTile['empty'] {
  if (items.length === 0) return 'none'
  const reasons = items.map((i) => (i.severity.level === 'unknown' ? i.severity.reason : null))
  if (reasons.some((r) => r === 'needs_perm')) return 'needs_perm'
  return reasons.every((r) => r !== null) ? 'other' : null
}

/** A certificate's days-left only ever falls; a step up between two scans is a renewal. */
export function tlsRenewed(days: readonly number[]): boolean {
  return days.some((d, i) => i > 0 && d > (days[i - 1] ?? d))
}

function change(series: readonly number[]): number | null {
  const a = series[series.length - 2]
  const b = series[series.length - 1]
  return a === undefined || b === undefined ? null : b - a
}

function sumTile(
  id: 'disk' | 'database',
  unit: 'bytes',
  items: Item[],
  facts: readonly ScanFact[],
): OverviewTile {
  const answered = items.filter((i) => !i.fact?.unknown && num(i.fact?.value) !== null)
  const value = answered.length ? answered.reduce((s, i) => s + (num(i.fact?.value) ?? 0), 0) : null
  const series = lastPoints(
    seqSums(
      facts,
      answered.map((i) => ({ check: i.key.check, host: i.key.host, target: i.key.target })),
    ),
    NINE,
  )
  return {
    id,
    unit,
    value,
    delta: change(series),
    series,
    tone: lineTone(items),
    empty: value === null ? emptyOf(items) : null,
    status: null,
    renewed: false,
    item: items[0],
  }
}

/** The four numbers of the project, in board order. */
export function overviewTiles(
  items: readonly Item[],
  facts: readonly ScanFact[],
  urls: readonly string[],
): OverviewTile[] {
  const http = itemsOf(items, 'url.http')
  const first = http.find((i) => i.key.target === urls[0]) ?? http[0]
  const uptimeSeries = first
    ? lastPoints(
        valueSeries(factsFor(facts, { check: 'url.http', target: first.key.target })),
        NINE,
      ).map((p) => p.value)
    : []
  const tlsItems = itemsOf(items, 'url.tls')
  const live = tlsItems.filter((i) => !i.fact?.unknown && num(i.fact?.value) !== null)
  const worst = [...live].sort((a, b) => (num(a.fact?.value) ?? 0) - (num(b.fact?.value) ?? 0))[0]
  const tlsSeries = worst
    ? lastPoints(
        valueSeries(factsFor(facts, { check: 'url.tls', target: worst.key.target })),
        NINE,
      ).map((p) => p.value)
    : []
  const code = num(dataOf(first?.fact).status)
  return [
    {
      id: 'uptime',
      unit: 'ms',
      value: first && !first.fact?.unknown ? num(first.fact?.value) : null,
      delta: null,
      series: uptimeSeries,
      tone: lineTone(first ? [first] : []),
      empty: first ? (num(first.fact?.value) === null ? emptyOf([first]) : null) : 'none',
      status: code,
      renewed: false,
      item: first,
    },
    sumTile('disk', 'bytes', itemsOf(items, 'disk.path'), facts),
    sumTile('database', 'bytes', itemsOf(items, 'db.size'), facts),
    {
      id: 'tls',
      unit: 'days',
      value: worst ? num(worst.fact?.value) : null,
      delta: null,
      series: tlsSeries,
      tone: lineTone(worst ? [worst] : []),
      empty: worst ? null : emptyOf(tlsItems),
      status: null,
      renewed: tlsRenewed(tlsSeries),
      item: worst,
    },
  ]
}

export type PartKind = Component['kind']

export interface PartRow {
  id: string
  role: Component['role']
  kind: PartKind
  /** Name on the row and the node: a path, a Compose project, a pm2 app, a database. */
  name: string
  host: string
  tone: NodeTone
  /** What the state column and the node's second line say, as data for the component to word. */
  state:
    | { kind: 'size'; bytes: number }
    | { kind: 'pm2'; status: string; instances: number | null; restarts: number }
    | { kind: 'compose'; up: number; down: number; restarts: number }
    | { kind: 'db'; engine: string; bytes: number | null; tables: number | null }
    | { kind: 'none' }
  cpu: number | null
  mem: number | null
  /** The technology the data names (compose is Docker, pm2, the database engine); else none. */
  brand: BrandName | null
  item?: Item
}

const MIB = 1024 * 1024

function findItem(items: readonly Item[], check: string, host: string, target: string) {
  return items.find((i) => i.key.check === check && i.key.host === host && i.key.target === target)
}

/** One row per saved part, with the live state from its own check. */
export function partRows(project: Project | undefined, items: readonly Item[]): PartRow[] {
  return (project?.components ?? []).map((c, n): PartRow => {
    const id = `${c.kind}-${n}`
    const base = {
      id,
      role: c.role,
      kind: c.kind,
      host: c.host,
      cpu: null,
      mem: null,
      brand: c.kind === 'db' ? brandOfEngine(c.engine) : brandOfKind(c.kind),
    }
    if (c.kind === 'path') {
      const item = findItem(items, 'disk.path', c.host, c.path)
      return {
        ...base,
        name: c.path,
        tone: toneOf(item),
        state:
          item && !item.fact?.unknown
            ? { kind: 'size', bytes: num(item.fact?.value) ?? 0 }
            : { kind: 'none' },
        item,
      }
    }
    if (c.kind === 'pm2') {
      const item = findItem(items, 'pm2.app', c.host, c.app)
      const v = item ? parsePm2(item) : null
      return {
        ...base,
        name: c.app,
        tone: toneOf(item),
        state: v
          ? { kind: 'pm2', status: v.status, instances: v.instances, restarts: v.restarts }
          : { kind: 'none' },
        mem: v?.memMb == null ? null : v.memMb * MIB,
        item,
      }
    }
    if (c.kind === 'compose') {
      const item = findItem(items, 'docker.compose', c.host, c.project)
      const v = item ? parseCompose(item) : null
      const cpu = v ? v.services.reduce((s, x) => s + (x.cpu ?? 0), 0) : null
      const mem = v ? v.services.reduce((s, x) => s + (x.mem ?? 0), 0) : null
      return {
        ...base,
        name: c.project,
        tone: toneOf(item),
        state: v
          ? { kind: 'compose', up: v.running, down: v.notRunning, restarts: v.restarts }
          : { kind: 'none' },
        cpu: v && v.services.length ? cpu : null,
        mem: v && v.services.length ? mem : null,
        item,
      }
    }
    const item = c.database ? findItem(items, 'db.size', c.host, c.database) : undefined
    const v = item ? parseDb(item) : null
    return {
      ...base,
      name: c.database ?? c.container ?? c.engine,
      tone: toneOf(item),
      state: { kind: 'db', engine: c.engine, bytes: v?.size ?? null, tables: v?.tables ?? null },
      item,
    }
  })
}

export type Tier = 'fe' | 'app' | 'db'

export interface WireNode extends PartRow {
  tier: Tier
}

export interface WireBand {
  tier: Tier
  /** One band per server: the parts of this tier that run on it. */
  host: string
  /** The band repeats a server another band already shows: it holds that server's data. */
  data: boolean
  nodes: WireNode[]
}

const TIER_OF: Record<Component['role'], Tier> = { fe: 'fe', be: 'app', worker: 'app', db: 'db' }
const TIER_ORDER: Tier[] = ['fe', 'app', 'db']

/** Parts grouped by server inside each tier (front end, back end and workers, databases). */
export function wiring(rows: readonly PartRow[]): WireBand[] {
  const bands: WireBand[] = []
  for (const tier of TIER_ORDER) {
    const inTier = rows.filter((r) => TIER_OF[r.role] === tier).map((r) => ({ ...r, tier }))
    for (const host of new Set(inTier.map((n) => n.host))) {
      const data = tier === 'db' && bands.some((b) => b.host === host)
      bands.push({ tier, host, data, nodes: inTier.filter((n) => n.host === host) })
    }
  }
  return bands
}

export interface LookRow {
  id: string
  item: Item
  level: 'warn' | 'crit' | 'unknown'
  /** Where its link goes. */
  target: { tab: 'disk' | 'database' | 'containers' | 'security' | 'overview' } | { host: string }
  issue: MainIssue
  needsPermission: boolean
}

const TAB_OF: Record<Item['group'], 'disk' | 'database' | 'containers' | 'security' | 'overview'> =
  {
    system: 'overview',
    disk: 'disk',
    containers: 'containers',
    databases: 'database',
    security: 'security',
    uptime: 'overview',
    code_changes: 'security',
  }

function issueOf(item: Item): MainIssue {
  const params: MainIssue['params'] = { target: item.key.target }
  if (item.fact?.value != null) params.value = item.fact.value
  if (item.fact?.unit != null) params.unit = item.fact.unit
  return { key: item.key, params, severity: item.severity }
}

/**
 * What needs a look: active warnings and critical results, and results that need permission, of
 * the project and of the servers it runs on, worst first. Expected and stale results stay out.
 */
export function needsLook(
  all: readonly Item[],
  projectId: string,
  hosts: readonly string[],
): LookRow[] {
  const mine = new Set(hosts)
  const rows: LookRow[] = []
  for (const item of all) {
    if (item.disposition.kind !== 'active') continue
    const own = item.owner.kind === 'project' && item.owner.id === projectId
    const server = item.owner.kind === 'server' && mine.has(item.owner.host)
    if (!own && !server) continue
    const level = item.severity.level
    const perm = level === 'unknown' && item.severity.reason === 'needs_perm'
    if (level !== 'warn' && level !== 'crit' && !perm) continue
    rows.push({
      id: `${item.key.host}|${item.key.check}|${item.key.target}`,
      item,
      level,
      target: own ? { tab: TAB_OF[item.group] } : { host: item.key.host },
      issue: issueOf(item),
      needsPermission: perm,
    })
  }
  const rank = (r: LookRow) => (r.level === 'crit' ? 0 : r.level === 'warn' ? 1 : 2)
  return rows.sort((a, b) => rank(a) - rank(b))
}

export interface StripCell {
  seq: number
  level: Level | 'none'
  /** The slowest answer of the project's URLs in that scan. */
  ms: number | null
}

/** One cell per kept scan (the last `max`), coloured by the core's grade of `url.http`. */
export function responseStrip(
  history: HistoryView | null | undefined,
  projectId: string,
  facts: readonly ScanFact[],
  urls: readonly string[],
  max = 30,
): StripCell[] {
  const scans = lastPoints(history?.scans ?? [], max)
  const targets = new Set(urls)
  return scans.map((scan) => {
    const level = scan.projects.find((p) => p.id === projectId)?.checks['url.http']
    const times = facts
      .filter(
        (f) => f.seq === scan.seq && f.fact.check === 'url.http' && targets.has(f.fact.target),
      )
      .flatMap((f) => (num(f.fact.value) === null ? [] : [num(f.fact.value) as number]))
    return { seq: scan.seq, level: level ?? 'none', ms: times.length ? Math.max(...times) : null }
  })
}

export function stripMedian(cells: readonly StripCell[]): number | null {
  return median(cells.flatMap((c) => (c.ms === null ? [] : [c.ms])))
}

/** The slowest cell that is not healthy, for the sentence under the strip. */
export function slowestBad(cells: readonly StripCell[]): StripCell | null {
  let worst: StripCell | null = null
  for (const c of cells) {
    if (c.level !== 'warn' && c.level !== 'crit') continue
    if (!worst || (c.ms ?? 0) > (worst.ms ?? 0)) worst = c
  }
  return worst
}

export interface UrlRow {
  url: string
  http: Item | undefined
  tls: Item | undefined
}

/** One row per project URL with its response and certificate results. */
export function urlRows(items: readonly Item[], urls: readonly string[]): UrlRow[] {
  return urls.map((url) => ({
    url,
    http: findItem(items, 'url.http', '@local', url),
    tls: findItem(items, 'url.tls', '@local', url),
  }))
}

/** `url.exposed` result of the project: `true` when a private file can be downloaded. */
export function exposure(items: readonly Item[]): 'none' | 'ok' | 'exposed' | 'unknown' {
  const list = itemsOf(items, 'url.exposed')
  if (list.length === 0) return 'none'
  if (list.some((i) => (num(i.fact?.value) ?? 0) > 0 && !i.fact?.unknown)) return 'exposed'
  if (list.some((i) => i.severity.level === 'unknown')) return 'unknown'
  return 'ok'
}

export const isStatusClass = (item: Item | undefined): string =>
  isRecord(item?.fact?.data) ? str(item.fact.data.class) : ''
