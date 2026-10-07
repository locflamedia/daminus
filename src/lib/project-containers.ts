// The Containers tab's model: Compose services and pm2 apps read from `docker.compose` and
// `pm2.app` facts, which service is the troubled one, and the two commands the tab offers. The
// tab never reads logs; it only shows what `docker inspect` and `pm2 jlist` gave.
import type { Item, ScanFact } from '@/api'
import { bool, dataOf, num, str } from './project-facts'

/** A container or host name that can be put in a command without quoting trouble. */
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export function isSafeName(value: string): boolean {
  return SAFE_NAME.test(value)
}

export interface ServiceView {
  name: string
  svc: string
  state: string
  restarts: number
  mem: number | null
  /** Memory limit in bytes; `null` when the container has none. */
  limit: number | null
  cpu: number | null
  oom: boolean
  exit: number | null
  started: string | null
  image: string
  /** Memory against its limit, 0 to 100; `null` without a limit. */
  memPct: number | null
}

export interface ComposeView {
  item: Item
  host: string
  project: string
  containers: number
  running: number
  notRunning: number
  restarts: number
  services: ServiceView[]
}

function service(raw: unknown): ServiceView | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const name = str(r.name)
  if (!name) return null
  const mem = num(r.mem)
  const limitRaw = num(r.limit)
  const limit = limitRaw !== null && limitRaw > 0 ? limitRaw : null
  return {
    name,
    svc: str(r.svc) || name,
    state: str(r.state),
    restarts: num(r.restarts) ?? 0,
    mem,
    limit,
    cpu: num(r.cpu),
    oom: bool(r.oom),
    exit: num(r.exit),
    started: str(r.started) || null,
    image: str(r.image),
    memPct: mem !== null && limit !== null ? Math.min(100, (mem / limit) * 100) : null,
  }
}

/** `docker.compose` item as a view; `null` when the item has no answer. */
export function parseCompose(item: Item): ComposeView | null {
  if (!item.fact || item.fact.unknown) return null
  const data = dataOf(item.fact)
  const raw = Array.isArray(data.services) ? data.services : []
  return {
    item,
    host: item.key.host,
    project: item.key.target,
    containers: num(data.containers) ?? raw.length,
    running: num(data.running) ?? 0,
    notRunning: num(data.not_running) ?? 0,
    restarts: num(data.restarts) ?? 0,
    services: raw.flatMap((s) => {
      const v = service(s)
      return v ? [v] : []
    }),
  }
}

/** A service that explains the card's warning: down, killed for memory, or restarted. */
export function troubled(s: ServiceView): boolean {
  return s.state !== 'running' || s.oom || s.restarts > 0
}

/** Memory bars turn amber above this share of the limit. */
export const MEM_WARN_PCT = 90

/** The service the "last exit" block and the finding speak about: down, killed, restarted. */
export function troubledService(services: readonly ServiceView[]): ServiceView | null {
  const rank = (s: ServiceView) => (s.state !== 'running' ? 0 : s.oom ? 1 : s.restarts > 0 ? 2 : 3)
  const worst = [...services].sort((a, b) => rank(a) - rank(b) || b.restarts - a.restarts)[0]
  return worst && troubled(worst) ? worst : null
}

export type TroubleKind = 'oom' | 'down' | 'restarts'

export function troubleKind(s: ServiceView): TroubleKind {
  return s.state !== 'running' ? 'down' : s.oom ? 'oom' : 'restarts'
}

/** Milliseconds a service has been up at `now`; `null` when not running or unknown. */
export function uptimeMs(s: ServiceView, now: number): number | null {
  if (s.state !== 'running' || !s.started) return null
  const at = Date.parse(s.started)
  return Number.isNaN(at) ? null : Math.max(0, now - at)
}

/** `ssh <host> "docker logs --tail 20 <name>"`; `null` when a name is not safe to paste. */
export function logsCommand(host: string, container: string): string | null {
  return isSafeName(host) && isSafeName(container)
    ? `ssh ${host} "docker logs --tail 20 ${container}"`
    : null
}

export function statsCommand(host: string, container: string): string | null {
  return isSafeName(host) && isSafeName(container)
    ? `ssh ${host} "docker stats --no-stream ${container}"`
    : null
}

export interface Pm2View {
  item: Item
  host: string
  app: string
  status: string
  daemon: boolean
  instances: number | null
  restarts: number
  memMb: number | null
  /** Unix seconds of the latest instance start. */
  started: number | null
}

export function parsePm2(item: Item): Pm2View | null {
  if (!item.fact || item.fact.unknown) return null
  const data = dataOf(item.fact)
  return {
    item,
    host: item.key.host,
    app: item.key.target,
    status: str(data.status),
    daemon: data.daemon !== false,
    instances: num(data.instances),
    restarts: num(data.restarts) ?? 0,
    memMb: num(data.mem_mb),
    started: num(data.started),
  }
}

/** A value of one service across scans: CPU or memory, by container name. */
export function serviceSeries(
  facts: readonly ScanFact[],
  host: string,
  project: string,
  name: string,
  field: 'cpu' | 'mem',
): { seq: number; value: number }[] {
  return facts
    .filter(
      (f) => f.fact.check === 'docker.compose' && f.host === host && f.fact.target === project,
    )
    .sort((a, b) => a.seq - b.seq)
    .flatMap((f) => {
      const raw = dataOf(f.fact).services
      const list = Array.isArray(raw) ? raw : []
      const hit = list.map(service).find((s) => s?.name === name)
      const value = hit ? hit[field] : null
      return value === null || value === undefined ? [] : [{ seq: f.seq, value }]
    })
}

/** The images a Compose project runs, each once, in service order. */
export function imagesOf(services: readonly ServiceView[]): string[] {
  return [...new Set(services.map((s) => s.image).filter(Boolean))]
}

/**
 * The first scan of the run that still holds the current images: when the project was last
 * updated. `null` when the images were the same in every kept scan.
 */
export function imageChangedAt(
  facts: readonly ScanFact[],
  host: string,
  project: string,
): number | null {
  const mine = facts
    .filter(
      (f) => f.fact.check === 'docker.compose' && f.host === host && f.fact.target === project,
    )
    .sort((a, b) => b.seq - a.seq)
  const key = (f: ScanFact) => {
    const raw = dataOf(f.fact).services
    const list = Array.isArray(raw) ? raw : []
    return imagesOf(list.flatMap((s) => service(s) ?? []))
      .sort()
      .join('|')
  }
  const now = mine[0]
  if (!now) return null
  const current = key(now)
  let first = now.seq
  for (const f of mine.slice(1)) {
    if (key(f) !== current) return first
    first = f.seq
  }
  return null
}

/** The highest value of a series, `null` when empty. */
export function peak(points: readonly { value: number }[]): number | null {
  return points.length ? Math.max(...points.map((p) => p.value)) : null
}

/** Other Compose projects on the same host: what else runs there, for the "also on" list. */
export function neighbours(all: readonly Item[], host: string, project: string): ServiceView[] {
  return all
    .filter(
      (i) => i.key.check === 'docker.compose' && i.key.host === host && i.key.target !== project,
    )
    .flatMap((i) => parseCompose(i)?.services ?? [])
}

/** Memory in use on a host, from its `sys.mem` result; `null` when the totals are not there. */
export function hostMemory(
  all: readonly Item[],
  host: string,
): { used: number; total: number } | null {
  const item = all.find((i) => i.key.check === 'sys.mem' && i.key.host === host)
  const data = dataOf(item?.fact)
  const total = num(data.total)
  const available = num(data.available)
  return total !== null && available !== null && total > 0
    ? { used: Math.max(0, total - available), total }
    : null
}
