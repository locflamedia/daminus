// The Disk tab's model: project folders from `disk.path` facts as treemap tiles with their growth
// since the previous scan, the largest files, the growth curve, the shared disks and what could
// be freed, all from real facts. Sizes are bytes; the components format them.
import type { Item, ScanFact } from '@/api'
import type { TreemapTile } from '@/ui/UiTreemap.vue'
import { bool, dataOf, itemsOf, num, pairs } from './project-facts'
import { factsFor, type SeriesPoint } from './project-series'

/** What Settings › Scan skips unless the person changed it: the core's defaults, which the
 *  webview cannot read from Settings yet. System paths are left out: they are not project folders. */
export const DEFAULT_SKIP_PATHS = [
  'node_modules',
  '.next/cache',
  'vendor',
  'storage/framework/cache',
] as const

/** A folder grows enough to be ringed when it gained at least this share of its previous size. */
export const GROW_SHARE = 0.1

export interface DiskPathView {
  item: Item
  host: string
  path: string
  total: number
  top: { name: string; bytes: number }[]
  other: number
  files: { name: string; bytes: number }[]
  partial: boolean
}

export function parseDiskPath(item: Item): DiskPathView | null {
  if (!item.fact || item.fact.unknown) return null
  const data = dataOf(item.fact)
  return {
    item,
    host: item.key.host,
    path: item.key.target,
    total: num(item.fact.value) ?? 0,
    top: pairs(data.top),
    other: num(data.other) ?? 0,
    files: pairs(data.files),
    partial: bool(data.partial),
  }
}

function baseName(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}

export interface DiskTileModel {
  tile: TreemapTile
  /** Bytes gained since the previous scan; `null` when that scan did not list the folder. */
  growth: number | null
}

/** Treemap tiles for every folder of every `disk.path` result. `format` writes bytes and deltas. */
export function diskTiles(
  views: readonly DiskPathView[],
  previous: ReadonlyMap<string, number>,
  format: { size: (b: number) => string; delta: (b: number) => string; none: string },
): DiskTileModel[] {
  const many = views.length > 1
  const out: DiskTileModel[] = []
  let other = 0
  for (const v of views) {
    other += v.other
    for (const f of v.top) {
      const id = `${v.host}:${v.path}/${f.name}`
      const before = previous.get(id)
      const growth = before === undefined ? null : f.bytes - before
      const grow = growth !== null && growth > 0 && growth >= (before ?? 1) * GROW_SHARE
      out.push({
        growth,
        tile: {
          id,
          label: many ? `${baseName(v.path)}/${f.name}` : f.name,
          value: f.bytes,
          display: format.size(f.bytes),
          delta: growth === null ? undefined : growth > 0 ? format.delta(growth) : format.none,
          deltaTone: growth !== null && growth > 0 ? 'warn' : 'neutral',
          grow,
          growth: grow ? (growth ?? 0) : undefined,
        },
      })
    }
  }
  if (other > 0) {
    out.push({
      growth: null,
      tile: { id: 'other', label: 'other', value: other, display: format.size(other), other: true },
    })
  }
  return out
}

/** Bytes by tile id across a previous scan's `disk.path` facts of the same results. */
export function previousSizes(
  facts: readonly ScanFact[],
  views: readonly DiskPathView[],
  seq: number | null | undefined,
): Map<string, number> {
  const map = new Map<string, number>()
  if (seq == null) return map
  for (const v of views) {
    const before = factsFor(facts, { check: 'disk.path', host: v.host, target: v.path }).filter(
      (f) => f.seq < seq,
    )
    const last = before[before.length - 1]
    for (const f of pairs(dataOf(last?.fact).top)) map.set(`${v.host}:${v.path}/${f.name}`, f.bytes)
  }
  return map
}

/** Project size per scan, summed over every folder the project has. */
export function diskSeries(
  facts: readonly ScanFact[],
  views: readonly Pick<DiskPathView, 'host' | 'path'>[],
): SeriesPoint[] {
  const bySeq = new Map<number, SeriesPoint>()
  for (const v of views) {
    for (const f of factsFor(facts, { check: 'disk.path', host: v.host, target: v.path })) {
      const value = num(f.fact.value)
      if (value === null) continue
      const at = bySeq.get(f.seq)
      bySeq.set(f.seq, { seq: f.seq, at: f.at, value: (at?.value ?? 0) + value })
    }
  }
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq)
}

export interface LargeFile {
  key: string
  host: string
  name: string
  bytes: number
  /** A large-log finding names this very file. */
  finding: boolean
}

/** Largest files of all folders, biggest first; a file a `logs.big` result names is flagged. */
export function largeFiles(views: readonly DiskPathView[], logs: readonly Item[]): LargeFile[] {
  const logged = new Set(logs.map((l) => `${l.key.host}:${l.key.target}`))
  return views
    .flatMap((v) =>
      v.files.map((f) => ({
        key: `${v.host}:${v.path}/${f.name}`,
        host: v.host,
        name: f.name,
        bytes: f.bytes,
        finding: logged.has(`${v.host}:${v.path}/${f.name}`),
      })),
    )
    .sort((a, b) => b.bytes - a.bytes)
}

export interface LogFinding {
  item: Item
  host: string
  path: string
  bytes: number
}

/** `logs.big` results with a file in them (a result with value 0 means none was found). */
export function logFindings(items: readonly Item[]): LogFinding[] {
  return itemsOf(items, 'logs.big').flatMap((item) => {
    const bytes = num(item.fact?.value)
    return item.fact?.unknown || bytes === null || bytes <= 0 || !item.key.target
      ? []
      : [{ item, host: item.key.host, path: item.key.target, bytes }]
  })
}

/** The folder a log file is in, `null` for a path that is not plain. */
export function dirOf(path: string): string | null {
  const i = path.lastIndexOf('/')
  return i > 0 ? path.slice(0, i) : null
}

/** A command to list a folder's files by size. */
export function listLogsCommand(host: string, dir: string): string | null {
  const plain = /^[A-Za-z0-9/._-]+$/
  return plain.test(host) && plain.test(dir) ? `ssh ${host} "ls -lhS ${dir} | head"` : null
}

export interface ServerDisk {
  host: string
  pct: number | null
  /** Bytes by who uses them on this host: each project's folders, then Docker. */
  shares: { label: string; bytes: number; docker?: boolean }[]
}

/** The filesystem fill of each host and who takes the space, from the whole report's items. */
export function serverDisks(all: readonly Item[], hosts: readonly string[]): ServerDisk[] {
  return hosts.map((host) => {
    const fs = all.filter((i) => i.key.check === 'disk.fs' && i.key.host === host)
    const pcts = fs.flatMap((i) => {
      const p = num(dataOf(i.fact).pct)
      return p === null ? [] : [p]
    })
    const byProject = new Map<string, number>()
    for (const i of all) {
      if (i.key.check !== 'disk.path' || i.key.host !== host || i.owner.kind !== 'project') continue
      byProject.set(i.owner.id, (byProject.get(i.owner.id) ?? 0) + (num(i.fact?.value) ?? 0))
    }
    const shares: ServerDisk['shares'] = [...byProject].map(([label, bytes]) => ({ label, bytes }))
    const docker = all.find((i) => i.key.check === 'docker.df' && i.key.host === host)
    const dockerBytes = num(docker?.fact?.value)
    if (dockerBytes) shares.push({ label: 'docker', bytes: dockerBytes, docker: true })
    return { host, pct: pcts.length ? Math.max(...pcts) : null, shares }
  })
}

export type FreeKind = 'buildCache' | 'images' | 'logs'

export interface FreeRow {
  kind: FreeKind
  host: string
  bytes: number
}

/** What Docker says it could reclaim and the large logs found: the only sources of "free space". */
export function freeable(all: readonly Item[], hosts: readonly string[]): FreeRow[] {
  const rows: FreeRow[] = []
  for (const host of hosts) {
    const df = all.find((i) => i.key.check === 'docker.df' && i.key.host === host)
    const data = dataOf(df?.fact)
    for (const [kind, key] of [
      ['buildCache', 'build_cache'],
      ['images', 'images'],
    ] as const) {
      const part = data[key]
      const bytes =
        typeof part === 'object' && part !== null && !Array.isArray(part)
          ? num(part.reclaimable)
          : null
      if (bytes && bytes > 0) rows.push({ kind, host, bytes })
    }
    const logs = logFindings(all.filter((i) => i.key.host === host))
    const sum = logs.reduce((s, l) => s + l.bytes, 0)
    if (sum > 0) rows.push({ kind: 'logs', host, bytes: sum })
  }
  return rows.sort((a, b) => b.bytes - a.bytes)
}
