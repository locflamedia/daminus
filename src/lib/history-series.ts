// The three curves of the History tab (project disk, database, response time) from the raw
// facts the core keeps per scan. A point is one scan on a real time axis, so uneven scans show
// as uneven. What counts for a project is what its components say: the size of its folders on
// their hosts, of its databases, and the first URL it is checked at.
import type { Project, ScanFact } from '@/api'
import { factData, num } from './security-data'

export const SERIES_CHECKS = ['disk.path', 'db.size', 'url.http'] as const

export type SeriesId = 'disk' | 'database' | 'response'

export interface SeriesPoint {
  seq: number
  /** Unix ms. */
  at: number
  value: number
}

export interface SeriesFacts {
  /** The facts of the scans in the window that belong to the project, oldest first. */
  disk: SeriesPoint[]
  database: SeriesPoint[]
  response: SeriesPoint[]
}

function sumBySeq(facts: readonly ScanFact[], matches: (f: ScanFact) => boolean): SeriesPoint[] {
  const by = new Map<number, SeriesPoint>()
  for (const f of facts) {
    const value = num(f.fact.value)
    if (value === undefined || !matches(f)) continue
    const at = Date.parse(f.at)
    const seen = by.get(f.seq)
    by.set(f.seq, { seq: f.seq, at, value: (seen?.value ?? 0) + value })
  }
  return [...by.values()].sort((a, b) => a.seq - b.seq)
}

/** Folders, databases and the first URL of a project, as the facts name them. */
export function projectSeries(
  facts: readonly ScanFact[],
  project: Project | undefined,
  seqs: ReadonlySet<number>,
): SeriesFacts {
  const inWindow = facts.filter((f) => seqs.has(f.seq))
  const folders = new Set(
    (project?.components ?? []).flatMap((c) => (c.kind === 'path' ? [`${c.host}\0${c.path}`] : [])),
  )
  const databases = new Set(
    (project?.components ?? []).flatMap((c) =>
      c.kind === 'db' && c.database ? [`${c.host}\0${c.database}`] : [],
    ),
  )
  const url = project?.urls[0]
  return {
    disk: sumBySeq(
      inWindow,
      (f) => f.fact.check === 'disk.path' && folders.has(`${f.host}\0${f.fact.target}`),
    ),
    database: sumBySeq(
      inWindow,
      (f) => f.fact.check === 'db.size' && databases.has(`${f.host}\0${f.fact.target}`),
    ),
    response: sumBySeq(
      inWindow,
      (f) =>
        f.fact.check === 'url.http' && f.fact.target === url && factData(f.fact).class !== 'error',
    ),
  }
}

export interface SeriesDelta {
  from: number
  to: number
  change: number
}

/** The change of a series from the baseline scan to the compared scan, when both have a point. */
export function seriesDelta(
  points: readonly SeriesPoint[],
  from: number,
  to: number,
): SeriesDelta | null {
  const a = points.find((p) => p.seq === from)
  const b = points.find((p) => p.seq === to)
  return a && b ? { from: a.value, to: b.value, change: b.value - a.value } : null
}

/** The `top` entries (folder or table name and bytes) of the project's facts in one scan. */
export function topAt(
  facts: readonly ScanFact[],
  project: Project | undefined,
  check: 'disk.path' | 'db.size',
  seq: number,
): Map<string, number> {
  const owned = new Set(
    (project?.components ?? []).flatMap((c) =>
      check === 'disk.path' && c.kind === 'path'
        ? [`${c.host}\0${c.path}`]
        : check === 'db.size' && c.kind === 'db' && c.database
          ? [`${c.host}\0${c.database}`]
          : [],
    ),
  )
  const out = new Map<string, number>()
  for (const f of facts) {
    if (f.seq !== seq || f.fact.check !== check || !owned.has(`${f.host}\0${f.fact.target}`))
      continue
    const top = factData(f.fact).top
    if (!Array.isArray(top)) continue
    for (const entry of top) {
      if (Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'number') {
        out.set(entry[0], (out.get(entry[0]) ?? 0) + entry[1])
      }
    }
  }
  return out
}

export interface TopEntry {
  name: string
  bytes: number
  /** Growth since the baseline scan, when the baseline has the same entry. */
  growth: number | null
}

/** The entry that grew most from `before` to `after`; the largest one when none grew. */
export function leadingEntry(
  after: ReadonlyMap<string, number>,
  before: ReadonlyMap<string, number>,
): TopEntry | null {
  let best: TopEntry | null = null
  for (const [name, bytes] of after) {
    const was = before.get(name)
    const growth = was === undefined ? null : bytes - was
    const better =
      best === null ||
      (growth ?? -Infinity) > (best.growth ?? -Infinity) ||
      (growth === best.growth && bytes > best.bytes)
    if (better) best = { name, bytes, growth }
  }
  return best && best.growth !== null && best.growth > 0 ? best : largest(after)
}

function largest(map: ReadonlyMap<string, number>): TopEntry | null {
  let best: TopEntry | null = null
  for (const [name, bytes] of map)
    if (best === null || bytes > best.bytes) best = { name, bytes, growth: null }
  return best
}
