// The words and numbers of an Overview project card: everything `UiProjectCard` takes, built
// from the card facts (`lib/overview-cards`), the running scan and how old the results are.
// Severity is the core's; a state here only picks which sentence to show.
import type { Item } from '@/api'
import { currentLocale, i18n } from '@/i18n'
import { formatDelta, formatDuration, formatMeasure, formatWeekdayDateTime } from '@/lib/format'
import { checkName, issueText } from '@/lib/issue-text'
import {
  needsLook,
  type DbCell,
  type DiskCell,
  type ProjectCardData,
  type SizeValue,
  type UptimeCell,
} from '@/lib/overview-cards'
import { tintOf } from '@/lib/overview-tint'
import type { CardScan } from '@/lib/overview-scan'
import type { ProjectTab } from '@/layout/project-tabs'
import type { NodeState, TopologyInput } from '@/lib/topology'
import type { MetricState, NoteTone } from '@/ui/UiMetricTile.vue'
import type { MonogramTint } from '@/ui/monogram-tints'
import type { ProjectCardMetric, ProjectCardState, ProjectCardStatus } from '@/ui/UiProjectCard.vue'
import type { RowTone } from '@/ui/UiRow.vue'

type Params = Record<string, string | number>

function t(key: string, params: Params = {}, plural?: number): string {
  const locale = currentLocale()
  return plural === undefined
    ? i18n.global.t(key, params, { locale })
    : i18n.global.t(key, params, { locale, plural })
}

/** What the card needs to know besides its own facts. */
export interface CardContext {
  domain: string | null
  color: string | null
  seq: number | null
  scannedAt: string | null
  /** Whole days the results are old when over a day, else `null`. */
  oldDays: number | null
  /** The card's place in the running scan; `null` when no scan runs. */
  scan: CardScan | null
  /** No scan has been saved yet. */
  first: boolean
}

export interface CardView {
  id: string
  name: string
  domain?: string
  tint: MonogramTint
  state: ProjectCardState
  stateLabel: string
  where: string
  tags: Array<{ label: string }>
  topology: readonly TopologyInput[]
  status: ProjectCardStatus
  actionLabel?: string
  /** What the status row's action does. */
  action: 'retry' | 'tab' | 'open' | null
  tab: ProjectTab | null
  retryHosts: string[]
  tls: Item | null
  metrics: ProjectCardMetric[]
  checkedAt?: string
  passedLabel: string
  /** The card is one the "Needs a look" filter keeps. */
  look: boolean
}

const TAB_OF_GROUP = {
  security: 'security',
  disk: 'disk',
  databases: 'database',
  containers: 'containers',
} as const

export function nodeStateWords(): Record<NodeState, string> {
  return {
    ok: t('overviewScreen.card.node.ok'),
    warn: t('overviewScreen.card.node.warn'),
    crit: t('overviewScreen.card.node.crit'),
    unknown: t('overviewScreen.card.node.unknown'),
  }
}

function stateOf(data: ProjectCardData, ctx: CardContext): [ProjectCardState, string] {
  if (ctx.first) return ['unreachable', t('overviewScreen.empty.title')]
  if (ctx.scan && ctx.scan.phase !== 'idle') {
    return ['scanning', t(`overviewScreen.card.${ctx.scan.phase}`)]
  }
  if (data.state === 'crit') return ['crit', t('overview.crit', { n: data.crit })]
  if (data.state === 'warn') return ['warn', t('overview.warn', { n: data.warn }, data.warn)]
  if (data.state === 'unreachable') return ['unreachable', t('nav.unreachable')]
  return ['ok', t('severity.ok')]
}

function whereOf(data: ProjectCardData): string {
  const [only] = data.hosts
  return data.hosts.length === 1 && only
    ? only
    : t('overview.serverCount', { n: data.hosts.length }, data.hosts.length)
}

function tagsOf(data: ProjectCardData): Array<{ label: string }> {
  return data.tags.map((tag) => ({
    label:
      tag.kind === 'database'
        ? t(`overviewScreen.tag.${tag.engine === 'postgres' ? 'postgres' : 'mysql'}`)
        : t(`overviewScreen.tag.${tag.kind}`),
  }))
}

function offWords(data: ProjectCardData): string {
  return data.offGroups.map((g) => t(`overviewScreen.group.${g}`)).join(', ')
}

function okMeta(data: ProjectCardData): string | undefined {
  const parts = [
    data.expected > 0 ? t('overviewScreen.status.expected', { n: data.expected }) : '',
    data.reviewInDays !== null ? t('overviewScreen.status.reviewIn', { n: data.reviewInDays }) : '',
    data.offGroups.length > 0 ? t('overviewScreen.status.off', { groups: offWords(data) }) : '',
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : undefined
}

function otherIssues(data: ProjectCardData): string | undefined {
  const names = data.otherChecks.map((c) => checkName(c))
  return names.length > 0 ? names.join(' · ') : undefined
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function issuesWord(data: ProjectCardData): string {
  const n = data.crit + data.warn
  return t('nav.issues', { n }, n)
}

function statusOf(data: ProjectCardData, ctx: CardContext): ProjectCardStatus {
  const scan = ctx.scan
  if (ctx.first) {
    return {
      tone: 'neutral',
      icon: 'clock',
      title: t('overviewScreen.status.firstScan'),
      meta: t('overviewScreen.status.firstScanMeta'),
    }
  }
  if (scan && scan.reading) {
    return {
      tone: 'neutral',
      icon: 'search',
      tileTone: 'info',
      title: t(
        scan.queuedOnly ? 'overviewScreen.status.waitingFor' : 'overviewScreen.status.reading',
        { host: scan.reading },
      ),
      meta: t('overviewScreen.status.readingMeta'),
    }
  }
  if (ctx.oldDays !== null) {
    const ago = t('time.daysAgoLong', { n: ctx.oldDays }, ctx.oldDays)
    const clear = data.crit + data.warn === 0
    return {
      tone: 'neutral',
      icon: 'clock',
      title: clear
        ? t('overviewScreen.status.clearAgo', { ago })
        : t('overviewScreen.status.issuesAgo', { issues: issuesWord(data), ago }),
      meta: ctx.scannedAt
        ? t('overviewScreen.status.oldMeta', {
            when: formatWeekdayDateTime(ctx.scannedAt),
            seq: ctx.seq ?? 0,
          })
        : undefined,
    }
  }
  if ((data.state === 'crit' || data.state === 'warn') && data.mainIssue) {
    const tone: RowTone = data.state
    const tls = data.mainIssue.key.check === 'url.tls'
    return {
      tone,
      icon: data.state === 'crit' ? 'critical' : 'warn',
      title: tls
        ? t('overviewScreen.status.tlsTitle', { host: hostOf(data.mainIssue.key.target) })
        : issueText(data.mainIssue),
      meta: otherIssues(data),
    }
  }
  if (data.state === 'unreachable') {
    const host = data.unreachableHosts[0] ?? ''
    return {
      tone: 'neutral',
      icon: 'unreachable',
      title: t('overviewScreen.status.silent', { host }),
      meta: t('overviewScreen.status.silentMeta'),
    }
  }
  return okStatus(data)
}

function okStatus(data: ProjectCardData): ProjectCardStatus {
  if (data.unreadable > 0) {
    return {
      tone: 'neutral',
      icon: 'lock',
      title: t('overviewScreen.status.cannotRead', { n: data.unreadable }, data.unreadable),
      meta: t('overviewScreen.status.cannotReadMeta'),
    }
  }
  if (data.total === 0) {
    return { tone: 'neutral', icon: 'clock', title: t('overviewScreen.status.noResults') }
  }
  return {
    tone: 'ok',
    icon: 'check-circle',
    title: t('overviewScreen.status.allPassed', { n: data.total }),
    meta: okMeta(data),
  }
}

// --- metrics ---------------------------------------------------------------------------

interface Look {
  state: MetricState
  /** The old-result age replaces the note, so the numbers do not claim to be current. */
  old: string | null
  reading: boolean
}

function note(
  text: string | undefined,
  tone: NoteTone,
): Pick<ProjectCardMetric, 'note' | 'noteTone'> {
  return text === undefined ? {} : { note: text, noteTone: tone }
}

function uptimeMetric(cell: UptimeCell, look: Look): ProjectCardMetric {
  const base: ProjectCardMetric = { label: t('overviewScreen.metric.uptime'), icon: 'globe' }
  if (look.reading) return { ...base, state: 'scanning' }
  if (cell.kind === 'off')
    return { ...base, state: 'needs-permission', ...note(t('overviewScreen.metric.off'), 'plain') }
  if (cell.kind === 'not-set-up') {
    return {
      ...base,
      state: 'not-set-up',
      value: t('overviewScreen.metric.notSetUp'),
      ...note(t('overviewScreen.metric.addUrl'), 'plain'),
    }
  }
  if (cell.kind === 'unknown') {
    return { ...base, state: 'needs-permission', ...note(t(`unknown.${cell.reason}`), 'old') }
  }
  const unit = cell.ms === null ? undefined : `· ${formatMeasure(cell.ms, 'ms').text}`
  const value = cell.status === null ? undefined : String(cell.status)
  if (look.old) return { ...base, value, unit, ...note(look.old, 'old') }
  const state: MetricState =
    cell.level === 'crit' ? 'crit' : cell.level === 'warn' ? 'warn' : 'normal'
  if (cell.status === null) {
    return { ...base, state, unit, ...note(t('overviewScreen.metric.noAnswer'), 'crit') }
  }
  if (cell.was !== null) {
    return {
      ...base,
      state,
      value,
      unit,
      ...note(t('overviewScreen.metric.was', { status: cell.was }), 'warn'),
    }
  }
  const tone: NoteTone = cell.level === 'crit' ? 'crit' : cell.level === 'warn' ? 'warn' : 'plain'
  return { ...base, state, value, unit, ...note(t('overviewScreen.metric.noChange'), tone) }
}

/** The change in bytes as a note: the unit is dropped when it is the value's own. */
function sizeNote(cell: SizeValue): Pick<ProjectCardMetric, 'note' | 'noteTone'> {
  if (cell.delta === null) return {}
  if (cell.delta === 0) return note(t('overviewScreen.metric.noChange'), 'plain')
  const own = formatMeasure(cell.bytes, 'bytes').unit
  const delta = formatDelta(cell.delta, 'bytes')
  return note(delta.unit === own ? delta.value : delta.text, cell.notable ? 'warn' : 'delta')
}

function sizeMetric(
  cell: DiskCell | DbCell,
  look: Look,
  label: string,
  icon: ProjectCardMetric['icon'],
  addHint: string,
): ProjectCardMetric {
  const base: ProjectCardMetric = { label, icon }
  if (look.reading) return { ...base, state: 'scanning' }
  if (cell.kind === 'off')
    return { ...base, state: 'needs-permission', ...note(t('overviewScreen.metric.off'), 'plain') }
  if (cell.kind === 'not-set-up') {
    return {
      ...base,
      state: 'not-set-up',
      value: t('overviewScreen.metric.notSetUp'),
      ...note(addHint, 'plain'),
    }
  }
  if (cell.kind === 'unknown') {
    return { ...base, state: 'needs-permission', ...note(t(`unknown.${cell.reason}`), 'old') }
  }
  const size = formatMeasure(cell.bytes, 'bytes')
  const shown = { ...base, value: size.value, unit: size.unit }
  if (look.old) return { ...shown, ...note(look.old, 'old') }
  if (cell.stale) {
    const since =
      cell.checkedSeq === null
        ? undefined
        : t('overviewScreen.metric.since', { seq: cell.checkedSeq })
    return { ...shown, state: 'stale', ...note(since, 'old') }
  }
  return { ...shown, ...sizeNote(cell) }
}

function metricsOf(data: ProjectCardData, ctx: CardContext): ProjectCardMetric[] {
  // Nothing was read yet: three empty tiles, not three claims that nothing is set up.
  if (ctx.first) {
    return [
      { label: t('overviewScreen.metric.uptime'), icon: 'globe' },
      { label: t('overviewScreen.metric.disk'), icon: 'disk' },
      { label: t('overviewScreen.metric.database'), icon: 'database' },
    ]
  }
  const old = ctx.oldDays === null ? null : t('time.daysAgo', { n: ctx.oldDays })
  const scan = ctx.scan
  const look = (reading: boolean | undefined): Look => ({
    state: 'normal',
    old,
    reading: reading === true,
  })
  const db = sizeMetric(
    data.db,
    look(scan?.db),
    t('overviewScreen.metric.database'),
    'database',
    t('overviewScreen.metric.addEnv'),
  )
  const lag = data.db.kind === 'value' && data.db.engine === 'mysql'
  return [
    uptimeMetric(data.uptime, look(scan?.uptime)),
    sizeMetric(
      data.disk,
      look(scan?.disk),
      t('overviewScreen.metric.disk'),
      'disk',
      t('overviewScreen.metric.addFolder'),
    ),
    lag ? { ...db, hint: t('overviewScreen.metric.mysqlLag') } : db,
  ]
}

// --- the card --------------------------------------------------------------------------

function passedLabel(data: ProjectCardData, ctx: CardContext): string {
  if (ctx.first) return t('overviewScreen.empty.waiting')
  if (ctx.scan && ctx.scan.phase !== 'idle') {
    return t(
      ctx.scan.phase === 'waiting'
        ? 'overviewScreen.card.thisScanWaiting'
        : 'overviewScreen.card.thisScanUpdating',
    )
  }
  const counts = { passed: data.passed, total: data.total }
  return ctx.oldDays !== null
    ? t('overviewScreen.card.passedOld', { seq: ctx.seq ?? 0, ...counts })
    : t('overviewScreen.card.passed', counts)
}

function actionOf(
  data: ProjectCardData,
  state: ProjectCardState,
  ctx: CardContext,
): Pick<CardView, 'actionLabel' | 'action' | 'tab'> {
  if (ctx.first || state === 'scanning' || ctx.oldDays !== null) {
    return { action: null, tab: null }
  }
  if (state === 'unreachable') {
    return { actionLabel: t('overviewScreen.card.retry'), action: 'retry', tab: null }
  }
  if (state === 'crit') {
    const tab =
      data.mainGroup && data.mainGroup in TAB_OF_GROUP
        ? TAB_OF_GROUP[data.mainGroup as keyof typeof TAB_OF_GROUP]
        : null
    if (tab) return { actionLabel: `${t(`project.tabs.${tab}`)} ›`, action: 'tab', tab }
  }
  if (state === 'crit' || state === 'warn') {
    return { actionLabel: `${t('overviewScreen.card.open')} ›`, action: 'open', tab: null }
  }
  return { action: null, tab: null }
}

/** Everything `UiProjectCard` needs for one project. */
export function cardView(data: ProjectCardData, ctx: CardContext): CardView {
  const [state, stateLabel] = stateOf(data, ctx)
  const settled = !ctx.first && !(ctx.scan && ctx.scan.phase !== 'idle') && ctx.oldDays === null
  return {
    id: data.id,
    name: data.name,
    domain: ctx.domain ?? undefined,
    tint: tintOf(ctx.color),
    state,
    stateLabel,
    where: whereOf(data),
    tags: tagsOf(data),
    topology: data.topology,
    status: statusOf(data, ctx),
    ...actionOf(data, state, ctx),
    retryHosts: data.unreachableHosts,
    tls: settled && data.state !== 'unreachable' ? data.tlsItem : null,
    metrics: metricsOf(data, ctx),
    checkedAt: settled && ctx.scannedAt ? ctx.scannedAt : undefined,
    passedLabel: passedLabel(data, ctx),
    look: needsLook(data),
  }
}

/** The duration of a finished scan as the toolbar writes it: `14.8 s`. */
export function tookText(ms: number): string {
  return formatDuration(ms)
}
