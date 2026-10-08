// "What changed" between two scans of a project, in words: what grew, what started, what was
// updated and what was fixed. Each row is read from the two reports the core evaluated (and, for
// "recovered", the scans between them), never guessed: a row exists only when both sides have
// the numbers. Sizes are formatted here; the sentences are message keys under `projectHistory`.
import type { Item, Level, Report, ScanSummary } from '@/api'
import { currentLocale, type Locale } from '@/i18n'
import { formatDelta, formatMeasure } from './format'
import { stripCell, STRIP_GROUPS } from './history-strip'
import { MIN_ROW_GROWTH_BYTES } from './presentation-hints'
import { factData, num, str } from './security-data'
import type { SeriesPoint } from './history-series'

export type ChangeKind = 'grew' | 'started' | 'updated' | 'fixed' | 'clean'
export type ChangeTone = 'warn' | 'info' | 'ok'

export interface ChangeRow {
  id: string
  kind: ChangeKind
  tone: ChangeTone
  /** A key under `projectHistory.change.title`. */
  title: string
  params: Record<string, string | number>
  /** A key under `projectHistory.change.sub`. */
  sub: string
  subParams: Record<string, string | number>
  /** What stands at the right: "+410 MB", "3", "fixed". */
  value: string
}

/** Rows shown at most. */
export const MAX_ROWS = 8

const TONE_ORDER: Record<ChangeTone, number> = { warn: 0, info: 1, ok: 2 }

interface Input {
  from: Report
  to: Report
  projectId: string
  /** Summaries of the scans from the baseline to the compared scan, inclusive. */
  scans: readonly ScanSummary[]
  response: readonly SeriesPoint[]
  locale?: Locale
}

function mine(report: Report, projectId: string): Item[] {
  return report.items.filter((i) => i.owner.kind === 'project' && i.owner.id === projectId)
}

function byKey(items: readonly Item[]): Map<string, Item> {
  return new Map(items.map((i) => [`${i.key.host}\0${i.key.check}\0${i.key.target}`, i]))
}

function pairs(value: unknown): [string, number][] {
  if (!Array.isArray(value)) return []
  return value.flatMap((e) =>
    Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'number'
      ? [[e[0], e[1]] as [string, number]]
      : [],
  )
}

/** The entries of `data.top` (name and bytes) that grew between the two items. */
function grownEntries(a: Item, b: Item): { name: string; growth: number }[] {
  const before = new Map(pairs(factData(a.fact).top))
  return pairs(factData(b.fact).top)
    .map(([name, bytes]) => ({ name, growth: bytes - (before.get(name) ?? bytes) }))
    .filter((e) => e.growth >= MIN_ROW_GROWTH_BYTES)
    .sort((x, y) => y.growth - x.growth)
}

function growthRows(a: Map<string, Item>, b: Map<string, Item>, locale: Locale): ChangeRow[] {
  const rows: ChangeRow[] = []
  for (const [key, after] of b) {
    const before = a.get(key)
    const check = after.key.check
    if (!before || (check !== 'disk.path' && check !== 'db.size')) continue
    const top = grownEntries(before, after).slice(0, check === 'disk.path' ? 1 : 2)
    for (const e of top) {
      const isDisk = check === 'disk.path'
      rows.push({
        id: `${check}:${key}:${e.name}`,
        kind: 'grew',
        tone: 'warn',
        title: isDisk ? 'folderGrew' : 'tableGrew',
        params: { name: e.name },
        sub: isDisk ? 'folderWhere' : 'tableWhere',
        subParams: isDisk
          ? { path: after.key.target, host: after.key.host }
          : { engine: str(factData(after.fact).engine) ?? '', database: after.key.target },
        value: formatDelta(e.growth, 'bytes', locale).text,
      })
    }
  }
  return rows
}

interface Service {
  name: string
  restarts: number
  image: string
}

function services(item: Item): Map<string, Service> {
  const list = factData(item.fact).services
  const out = new Map<string, Service>()
  if (!Array.isArray(list)) return out
  for (const s of list) {
    if (typeof s !== 'object' || s === null) continue
    const rec = s as Record<string, unknown>
    const name = str(rec.name)
    if (name) out.set(name, { name, restarts: num(rec.restarts) ?? 0, image: str(rec.image) ?? '' })
  }
  return out
}

function containerRows(a: Map<string, Item>, b: Map<string, Item>): ChangeRow[] {
  const rows: ChangeRow[] = []
  for (const [key, after] of b) {
    const before = a.get(key)
    if (!before || after.key.check !== 'docker.compose') continue
    const was = services(before)
    for (const now of services(after).values()) {
      const old = was.get(now.name)
      if (!old) continue
      if (now.restarts > old.restarts) {
        rows.push({
          id: `restarts:${key}:${now.name}`,
          kind: 'started',
          tone: 'warn',
          title: 'restarts',
          params: { name: now.name },
          sub: 'restartsSub',
          subParams: { from: old.restarts, to: now.restarts },
          value: String(now.restarts - old.restarts),
        })
      }
      if (old.image && now.image && old.image !== now.image) {
        rows.push({
          id: `image:${key}:${now.name}`,
          kind: 'updated',
          tone: 'info',
          title: 'imageUpdated',
          params: { name: now.name },
          sub: 'imageSub',
          subParams: { from: old.image, to: now.image },
          value: '',
        })
      }
    }
  }
  return rows
}

function levelOf(item: Item): Level | 'unknown' {
  return item.severity.level
}

const BAD: readonly string[] = ['warn', 'crit']

function levelRows(a: Map<string, Item>, b: Map<string, Item>, projectId: string): ChangeRow[] {
  const rows: ChangeRow[] = []
  for (const [key, after] of b) {
    const before = a.get(key)
    const now = levelOf(after)
    const was = before ? levelOf(before) : 'ok'
    if (after.disposition.kind !== 'active' || after.key.check === 'url.http') continue
    const worse = BAD.includes(now) && !BAD.includes(was)
    const better = !!before && BAD.includes(was) && now === 'ok'
    if (!worse && !better) continue
    const tls = after.key.check === 'url.tls'
    rows.push({
      id: `level:${projectId}:${key}`,
      kind: better ? 'fixed' : 'started',
      tone: better ? 'ok' : 'warn',
      title: better ? (tls ? 'tlsRenewed' : 'fixed') : 'turned',
      params: { check: after.key.check, target: after.key.target },
      sub: tls ? 'tlsSub' : 'where',
      subParams: tls
        ? {
            host: hostOf(after.key.target),
            from: Math.trunc(num(before?.fact?.value) ?? 0),
            to: Math.trunc(num(after.fact?.value) ?? 0),
          }
        : { target: after.key.target || after.key.host, host: after.key.host },
      value: better ? 'fixed' : levelWord(now),
    })
  }
  return rows
}

function levelWord(level: Level | 'unknown'): string {
  return level === 'crit' ? 'crit' : 'warn'
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function recoveredRow(input: Input, locale: Locale): ChangeRow[] {
  const { scans, response, projectId } = input
  const last = scans[scans.length - 1]
  if (!last) return []
  const slow = scans.filter((s) => {
    const level = s.projects.find((p) => p.id === projectId)?.checks['url.http']
    return level === 'warn' || level === 'crit'
  })
  const worst = slow.reduce<SeriesPoint | null>((best, s) => {
    const p = response.find((r) => r.seq === s.seq)
    return p && (!best || p.value > best.value) ? p : best
  }, null)
  const now = response.find((r) => r.seq === last.seq)
  const stillBad = last.projects.find((p) => p.id === projectId)?.checks['url.http']
  if (!worst || !now || stillBad === 'warn' || stillBad === 'crit') return []
  return [
    {
      id: 'response-recovered',
      kind: 'fixed',
      tone: 'ok',
      title: 'responseRecovered',
      params: {},
      sub: 'responseSub',
      subParams: {
        peak: formatMeasure(worst.value, 'ms', locale).text,
        seq: worst.seq,
        now: formatMeasure(now.value, 'ms', locale).text,
      },
      value: 'fixed',
    },
  ]
}

function cleanRow(input: Input): ChangeRow[] {
  const group = STRIP_GROUPS.find((g) => g.id === 'security')
  const { scans, projectId } = input
  const first = scans[0]
  if (!group || !first || scans.length < 2) return []
  const cells = scans.map((s) => stripCell(s, projectId, group))
  if (!cells.every((c) => c === 'ok')) return []
  const checks = scans[scans.length - 1]?.projects.find((p) => p.id === projectId)?.checks ?? {}
  const n = group.checks.filter((c) => c in checks).length
  return [
    {
      id: 'security-clean',
      kind: 'clean',
      tone: 'ok',
      title: 'securityClean',
      params: {},
      sub: 'cleanSub',
      subParams: { n, scans: scans.length - 1, seq: first.seq },
      value: 'clean',
    },
  ]
}

/** The rows, worst first, at most `MAX_ROWS`. */
export function changesBetween(input: Input): ChangeRow[] {
  const locale = input.locale ?? currentLocale()
  const a = byKey(mine(input.from, input.projectId))
  const b = byKey(mine(input.to, input.projectId))
  const rows = [
    ...growthRows(a, b, locale),
    ...containerRows(a, b),
    ...levelRows(a, b, input.projectId),
    ...recoveredRow(input, locale),
    ...cleanRow(input),
  ]
  return rows
    .map((r, i) => ({ r, i }))
    .sort((x, y) => TONE_ORDER[x.r.tone] - TONE_ORDER[y.r.tone] || x.i - y.i)
    .map(({ r }) => r)
    .slice(0, MAX_ROWS)
}
