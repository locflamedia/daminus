// What an Overview project card is made of, read from the report and the saved project: the
// stack tags, the topology, the one main issue and the lines under it, three metrics with their
// change since the baseline, and how many checks passed. It returns facts (numbers, ids,
// levels), never sentences: the screen words them in the current language. Severity is the
// core's: nothing here grades a result again.
import type {
  CheckGroup,
  ExpectedRule,
  Item,
  Level,
  HostOutcome,
  MainIssue,
  Project,
  ProjectRollup,
  Report,
} from '@/api'
import type { UnknownReason } from '@/api/bindings/UnknownReason'
import type { JsonValue } from '@/api/bindings/serde_json/JsonValue'
import { GROWTH_SHARE } from './presentation-hints'
import type { NodeState, TopologyInput, TopologyRole } from './topology'

export type CardState = 'crit' | 'warn' | 'ok' | 'unreachable'

export interface UptimeMetric {
  kind: 'value'
  /** HTTP status of the URL that matters most; `null` when no answer came. */
  status: number | null
  ms: number | null
  level: Level
  /** The status of the baseline scan when it differs, so the note can say "was 200". */
  was: number | null
}

export interface SizeValue {
  kind: 'value'
  bytes: number
  /** Change since the baseline; `null` when the baseline has no such size. */
  delta: number | null
  notable: boolean
  /** The result was not checked in the latest scan. */
  stale: boolean
  /** The scan the result was last checked in, when it is stale. */
  checkedSeq: number | null
}

export interface DbValue extends SizeValue {
  engine: string | null
}

export type MetricOff = { kind: 'off' }
export type MetricNone = { kind: 'not-set-up' }
export type MetricUnknown = { kind: 'unknown'; reason: UnknownReason }

export type UptimeCell = UptimeMetric | MetricOff | MetricNone | MetricUnknown
export type DiskCell = SizeValue | MetricOff | MetricNone | MetricUnknown
export type DbCell = DbValue | MetricOff | MetricNone | MetricUnknown

export interface CardTag {
  kind: 'compose' | 'pm2' | 'database'
  /** The database engine (`mysql`, `postgres`) for a database tag. */
  engine?: string
}

export interface ProjectCardData {
  id: string
  name: string
  level: Level
  state: CardState
  mainIssue: MainIssue | null
  /** The check ids of the other open issues, worst first, each once. */
  otherChecks: string[]
  /** The `url.tls` result behind the main issue, for the certificate chip. */
  tlsItem: Item | null
  /** The group of the main issue, for the action that opens the right tab. */
  mainGroup: CheckGroup | null
  tags: CardTag[]
  topology: TopologyInput[]
  hosts: string[]
  unreachableHosts: string[]
  /** How the first of them failed, for the sentence and the step that can fix it. */
  unreachableOutcome: HostOutcome | null
  /** Whether that host ever answered a scan, so there are earlier results to show. */
  unreachableAnswered: boolean
  uptime: UptimeCell
  disk: DiskCell
  db: DbCell
  passed: number
  total: number
  expected: number
  crit: number
  warn: number
  /** Results that could not be read (needs permission, timed out, not found...). */
  unreadable: number
  /** Results of the project the latest scan did not check again. */
  staleCount: number
  /** Days until the soonest review of an expected rule of this project; `null` when none. */
  reviewInDays: number | null
  /** Groups switched off in Settings whose results this card would show. */
  offGroups: CheckGroup[]
  /** The oldest scan a stale result of the project was last checked in. */
  staleSince: number | null
}

export interface CardInput {
  project: Project
  rollup: ProjectRollup | undefined
  report: Report
  baseline: Report | null
  rules: readonly ExpectedRule[]
  /** The report's time, for review dates. */
  now: number
}

const DAY_MS = 86_400_000
const SEVERITY_RANK: Record<string, number> = { crit: 3, warn: 2, unknown: 1, ok: 0, info: 0 }

function record(value: JsonValue | undefined): Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {}
}

function ownedBy(item: Item, id: string): boolean {
  return item.owner.kind === 'project' && item.owner.id === id
}

function keyOf(item: Item): string {
  return `${item.key.host}|${item.key.check}|${item.key.target}`
}

function levelOf(item: Item): number {
  return SEVERITY_RANK[item.severity.level] ?? 0
}

/** The roles of a project as the card names them: a monolith's backend is the app. */
function topologyOf(project: Project, items: readonly Item[]): TopologyInput[] {
  const hasFe = project.components.some((c) => c.role === 'fe')
  return project.components.map((c, index) => {
    const role: TopologyRole = c.role === 'be' && !hasFe ? 'app' : c.role
    return {
      id: `${c.role}-${index}`,
      label: role.toUpperCase(),
      role,
      host: c.host,
      state: hostState(items, c.host),
    }
  })
}

function hostState(items: readonly Item[], host: string): NodeState {
  let worst: NodeState = 'ok'
  for (const item of items) {
    if (item.key.host !== host || item.disposition.kind !== 'active') continue
    const level = item.severity.level
    if (level === 'crit') return 'crit'
    if (level === 'warn') worst = 'warn'
    else if (level === 'unknown' && worst === 'ok') worst = 'unknown'
  }
  return worst
}

function tagsOf(project: Project): CardTag[] {
  const tags: CardTag[] = []
  for (const c of project.components) {
    if (c.kind === 'compose' && !tags.some((t) => t.kind === 'compose')) {
      tags.push({ kind: 'compose' })
    } else if (c.kind === 'pm2' && !tags.some((t) => t.kind === 'pm2')) {
      tags.push({ kind: 'pm2' })
    } else if (
      c.kind === 'db' &&
      !tags.some((t) => t.kind === 'database' && t.engine === c.engine)
    ) {
      tags.push({ kind: 'database', engine: c.engine })
    }
  }
  return tags
}

function status(item: Item): number | null {
  const s = record(item.fact?.data).status
  return typeof s === 'number' ? s : null
}

function uptimeOf(
  project: Project,
  mine: readonly Item[],
  baseline: readonly Item[],
  off: boolean,
): UptimeCell {
  if (off) return { kind: 'off' }
  if (project.urls.length === 0) return { kind: 'not-set-up' }
  const https = mine.filter((i) => i.key.check === 'url.http')
  // The worst URL leads; among equals the first one the project lists.
  const worst = [...https].sort(
    (a, b) =>
      levelOf(b) - levelOf(a) ||
      project.urls.indexOf(a.key.target) - project.urls.indexOf(b.key.target),
  )[0]
  if (!worst) return { kind: 'not-set-up' }
  const level = worst.severity.level
  if (level === 'unknown') return { kind: 'unknown', reason: worst.severity.reason }
  const before = baseline.find((i) => keyOf(i) === keyOf(worst))
  const now = status(worst)
  const then = before ? status(before) : null
  return {
    kind: 'value',
    status: now,
    ms: typeof worst.fact?.value === 'number' ? worst.fact.value : null,
    level,
    was: before && then !== now ? then : null,
  }
}

function sizeCell(
  mine: readonly Item[],
  baseline: readonly Item[],
  check: string,
  off: boolean,
  configured: boolean,
): { cell: SizeValue | MetricOff | MetricNone | MetricUnknown; engine: string | null } {
  if (off) return { cell: { kind: 'off' }, engine: null }
  if (!configured) return { cell: { kind: 'not-set-up' }, engine: null }
  const rows = mine.filter((i) => i.key.check === check)
  if (rows.length === 0) return { cell: { kind: 'not-set-up' }, engine: null }
  const known = rows.filter((i) => typeof i.fact?.value === 'number' && !i.fact.unknown)
  if (known.length === 0) {
    const sev = rows[0]?.severity
    return {
      cell: { kind: 'unknown', reason: sev?.level === 'unknown' ? sev.reason : 'missing' },
      engine: null,
    }
  }
  const bytes = known.reduce((sum, i) => sum + (i.fact?.value ?? 0), 0)
  // The change counts only the results both scans have, so a new folder is not "growth".
  const common = known.filter((i) => baseline.some((b) => keyOf(b) === keyOf(i)))
  const before = common.reduce(
    (sum, i) => sum + (baseline.find((b) => keyOf(b) === keyOf(i))?.fact?.value ?? 0),
    0,
  )
  const now = common.reduce((sum, i) => sum + (i.fact?.value ?? 0), 0)
  const delta = common.length === 0 ? null : now - before
  const stale = known.every((i) => i.disposition.kind === 'stale')
  const first = known[0]
  const engine = record(first?.fact?.data).engine
  const seqs = known.map((i) => i.checked_seq).filter((s): s is number => typeof s === 'number')
  return {
    cell: {
      kind: 'value',
      bytes,
      delta,
      notable: delta !== null && before > 0 && delta / before >= GROWTH_SHARE,
      stale,
      checkedSeq: stale && seqs.length > 0 ? Math.min(...seqs) : null,
    },
    engine: typeof engine === 'string' ? engine : null,
  }
}

function issuesOf(mine: readonly Item[]): Item[] {
  return mine
    .filter(
      (i) =>
        i.disposition.kind === 'active' &&
        (i.severity.level === 'crit' || i.severity.level === 'warn'),
    )
    .sort((a, b) => levelOf(b) - levelOf(a))
}

/** Whole calendar days (UTC, as review days are) from `now` to the day `YYYY-MM-DD`. */
export function daysToDay(day: string, now: number): number {
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Math.floor(now / DAY_MS) * DAY_MS) / DAY_MS)
}

function reviewDays(
  rules: readonly ExpectedRule[],
  mine: readonly Item[],
  now: number,
): number | null {
  const ids = new Set(
    mine.flatMap((i) => (i.disposition.kind === 'expected' ? [i.disposition.rule] : [])),
  )
  const days = rules
    .filter((r) => ids.has(r.id) && r.until)
    .map((r) => daysToDay(r.until ?? '', now))
  return days.length === 0 ? null : Math.max(0, Math.min(...days))
}

function stateOf(rollup: ProjectRollup | undefined): CardState {
  if (rollup?.level === 'crit') return 'crit'
  if (rollup?.level === 'warn') return 'warn'
  return (rollup?.unreachable_hosts.length ?? 0) > 0 ? 'unreachable' : 'ok'
}

function isPass(item: Item): boolean {
  if (item.disposition.kind === 'expected') return true
  return (
    item.disposition.kind === 'active' &&
    (item.severity.level === 'ok' || item.severity.level === 'info')
  )
}

/** The card of one project, from the latest report and the baseline it is compared with. */
export function buildProjectCard(input: CardInput): ProjectCardData {
  const { project, rollup, report, baseline, rules } = input
  const mine = report.items.filter((i) => ownedBy(i, project.id))
  const before = (baseline?.items ?? []).filter((i) => ownedBy(i, project.id))
  const off = (group: CheckGroup) => report.disabled_groups.includes(group)
  const hasDb = project.components.some((c) => c.kind === 'db')
  const issues = issuesOf(mine)
  const main = rollup?.main_issue ?? null
  const tls = main?.key.check === 'url.tls' ? mine.find((i) => keyOf(i) === keyOfIssue(main)) : null
  const disk = sizeCell(mine, before, 'disk.path', off('disk'), project.components.length > 0)
  const db = sizeCell(mine, before, 'db.size', off('databases'), hasDb)
  const mainCheck = main?.key.check
  const silent = report.servers.find((s) => s.host === rollup?.unreachable_hosts[0])
  const stale = mine.filter((i) => i.disposition.kind === 'stale')
  const seqs = stale
    .map((i) => i.disposition)
    .flatMap((d) => (d.kind === 'stale' ? [d.since_seq] : []))
  return {
    id: project.id,
    name: project.name,
    level: rollup?.level ?? 'ok',
    state: stateOf(rollup),
    mainIssue: main,
    otherChecks: [...new Set(issues.map((i) => i.key.check))].filter((c) => c !== mainCheck),
    tlsItem: tls ?? null,
    mainGroup: main ? (mine.find((i) => keyOf(i) === keyOfIssue(main))?.group ?? null) : null,
    tags: tagsOf(project),
    topology: topologyOf(project, mine),
    hosts: [...new Set(project.components.map((c) => c.host))],
    unreachableHosts: rollup?.unreachable_hosts ?? [],
    unreachableOutcome: silent?.outcome ?? null,
    unreachableAnswered: Boolean(silent?.last_reached_at),
    uptime: uptimeOf(project, mine, before, off('uptime')),
    disk: disk.cell,
    db: db.cell.kind === 'value' ? { ...db.cell, engine: db.engine } : db.cell,
    passed: mine.filter(isPass).length,
    total: mine.length,
    expected: rollup?.counts.expected ?? 0,
    crit: rollup?.counts.crit ?? 0,
    warn: rollup?.counts.warn ?? 0,
    unreadable: (rollup?.counts.needs_perm ?? 0) + (rollup?.counts.unknown ?? 0),
    staleCount: rollup?.counts.stale ?? 0,
    reviewInDays: reviewDays(rules, mine, input.now),
    offGroups: report.disabled_groups.filter((g) => g !== 'system' && g !== 'code_changes'),
    staleSince: seqs.length > 0 ? Math.min(...seqs) : null,
  }
}

function keyOfIssue(issue: MainIssue): string {
  return `${issue.key.host}|${issue.key.check}|${issue.key.target}`
}

/** The cards in the order the report's rollups give (already sorted), one per saved project. */
export function buildProjectCards(
  projects: readonly Project[],
  report: Report,
  baseline: Report | null,
  rules: readonly ExpectedRule[],
  now: number,
): ProjectCardData[] {
  const byId = new Map(projects.map((p) => [p.id, p]))
  const ordered = report.projects.flatMap((r) => {
    const project = byId.get(r.id)
    return project ? [{ project, rollup: r }] : []
  })
  // A saved project the report does not know yet (added after the last scan) comes last.
  const known = new Set(ordered.map((o) => o.project.id))
  const rest = projects
    .filter((p) => !known.has(p.id))
    .map((project) => ({ project, rollup: undefined }))
  return [...ordered, ...rest].map(({ project, rollup }) =>
    buildProjectCard({ project, rollup, report, baseline, rules, now }),
  )
}

/** The "Needs a look" filter: critical and warning cards, and cards whose host is silent. */
export function needsLook(card: Pick<ProjectCardData, 'state'>): boolean {
  return card.state !== 'ok'
}
