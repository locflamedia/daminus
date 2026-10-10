// What the discover screen shows, worked out from the records of each host: counts per kind, the
// state of a lane, the sources a host could not read (with the fix that can be copied), the
// finds in their columns with the project each belongs to, the listeners nothing accounts for,
// and the pairs of a front end and a back end that sit apart. Pure: the screen only draws it.
import type { HostOutcome, NoteCode, Proposal, SetupRecord } from '@/api'
import { safeUser, shellQuote } from './host-test'

type Rec<K extends SetupRecord['rec']> = Extract<SetupRecord, { rec: K }>

/** The records of one host, as the screen gets them from the store. */
export interface HostRecords {
  host: string
  records: readonly SetupRecord[]
}

// --- counts ---------------------------------------------------------------------------------

export interface HostCounts {
  sites: number
  compose: number
  pm2: number
  databases: number
  env: number
  ports: number
}

export function countsOf(records: readonly SetupRecord[]): HostCounts {
  const n: HostCounts = { sites: 0, compose: 0, pm2: 0, databases: 0, env: 0, ports: 0 }
  for (const r of records) {
    if (r.rec === 'vhost') n.sites += 1
    else if (r.rec === 'compose') n.compose += 1
    else if (r.rec === 'pm2') n.pm2 += 1
    else if (r.rec === 'db') n.databases += 1
    else if (r.rec === 'env') n.env += 1
    else if (r.rec === 'port') n.ports += 1
  }
  return n
}

/** What the lane counts as "found": the things that make up projects (as the header does). */
export function foundIn(records: readonly SetupRecord[]): number {
  const n = countsOf(records)
  return n.sites + n.compose + n.pm2 + n.databases
}

// --- lanes ----------------------------------------------------------------------------------

export type LaneState = 'queued' | 'running' | 'done' | 'incomplete' | 'timeout' | 'unreachable'

export interface LaneProgress {
  state: 'queued' | 'connecting' | 'agent_wait' | 'running' | 'finished'
}

/** The sources a host has that it could not read: a note, or another user's pm2 daemon. */
export function unreadCount(records: readonly SetupRecord[]): number {
  return incompleteRows(records, null).length
}

/**
 * Where a lane stands. A finished host that reached its end is `done`, or `incomplete` when a
 * source could not be read (what was found is right, so never a failure); a host the core
 * stopped or could not log in to is `timeout` or `unreachable`.
 */
export function laneState(
  progress: LaneProgress | undefined,
  end: { outcome: HostOutcome } | undefined,
  records: readonly SetupRecord[],
): LaneState {
  if (end) {
    switch (end.outcome.state) {
      case 'reached':
        return unreadCount(records) > 0 ? 'incomplete' : 'done'
      case 'partial':
        return 'incomplete'
      case 'timeout':
        return 'timeout'
      default:
        return 'unreachable'
    }
  }
  if (!progress || progress.state === 'queued') return 'queued'
  return 'running'
}

export type ReadingSource = 'nginx' | 'containers' | 'pm2' | 'databases' | 'ports' | 'env'

const SOURCE_ORDER: readonly ReadingSource[] = [
  'nginx',
  'containers',
  'pm2',
  'databases',
  'ports',
  'env',
]

/** How far discover is along its six sources, 0 to 1, for the ring of a lane being read. */
export function readingFraction(source: ReadingSource): number {
  return SOURCE_ORDER.indexOf(source) / SOURCE_ORDER.length
}

const AFTER_NOTE: Record<NoteCode, ReadingSource> = {
  nginx_no_permission: 'containers',
  docker_no_permission: 'pm2',
  docker_stopped: 'pm2',
  pm2_missing: 'databases',
}

/**
 * Which source discover is reading now. It reads nginx, containers, pm2, databases, ports and
 * `.env` files in that order and prints each as it goes, so the last record tells which source
 * is done and the next one is being read.
 */
export function readingSource(records: readonly SetupRecord[]): ReadingSource {
  const last = records[records.length - 1]
  if (!last) return 'nginx'
  switch (last.rec) {
    case 'vhost':
      return 'containers'
    case 'compose':
      return 'pm2'
    case 'pm2':
    case 'pm2_home':
      return 'databases'
    case 'db':
      return 'ports'
    case 'note':
      return AFTER_NOTE[last.code]
    default:
      return 'env'
  }
}

// --- sources it could not read ---------------------------------------------------------------

export interface IncompleteRow {
  key: string
  code: NoteCode | 'pm2_home'
  /** The owner of a pm2 daemon this login may not ask (`/home/<user>/.pm2`), when it shows. */
  user: string | null
  /** The daemon's folder when no user shows in it. */
  home: string | null
  /** The login the host was read with, for the sentence that says "from this login". */
  login: string | null
  /** The fix to copy, only when it can be stated truthfully. */
  command: string | null
}

const PM2_USER = /^\/home\/([^/]+)\/\.pm2\/?$/

/** One row per source a host has but this login could not read, from its notes and pm2 homes. */
export function incompleteRows(
  records: readonly SetupRecord[],
  login: string | null,
): IncompleteRow[] {
  const out: IncompleteRow[] = []
  const seen = new Set<string>()
  const safeLogin = login !== null && safeUser(login) !== '<user>' ? login : null
  for (const r of records) {
    if (r.rec === 'pm2_home') {
      const key = `pm2_home|${r.home}`
      if (seen.has(key)) continue
      seen.add(key)
      const user = PM2_USER.exec(r.home)?.[1] ?? null
      out.push({
        key,
        code: 'pm2_home',
        user,
        home: user ? null : r.home,
        login,
        command: null,
      })
    } else if (r.rec === 'note') {
      const key = `note|${r.code}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        key,
        code: r.code,
        user: null,
        home: null,
        login,
        command: noteCommand(r.code, safeLogin),
      })
    }
  }
  return out
}

function noteCommand(code: NoteCode, user: string | null): string | null {
  if (code === 'docker_no_permission') {
    return user ? `sudo usermod -aG docker ${shellQuote(user)}` : null
  }
  if (code === 'docker_stopped') return 'sudo systemctl start docker'
  return null
}

export interface LaneDetails {
  dropped: number
  /** `.env` files that were listed but cannot be read. */
  unreadable: string[]
}

export function laneDetails(records: readonly SetupRecord[], dropped: number): LaneDetails {
  const unreadable = records.flatMap((r) => (r.rec === 'env' && !r.readable ? [r.path] : []))
  return { dropped, unreadable }
}

// --- projects --------------------------------------------------------------------------------

export type ProjectRef = { id: string; name: string } | 'unassigned' | null

function bareName(name: string): string {
  return name.toLowerCase().replace(/^www\./, '')
}

function urlHost(url: string): string {
  try {
    return bareName(new URL(url.trim()).hostname)
  } catch {
    return ''
  }
}

/** The catch-all server block (`server_name _` only): the screens call it the default site. */
export function isDefaultSite(v: Pick<Rec<'vhost'>, 'names'>): boolean {
  return v.names.length > 0 && v.names.every((n) => n === '_')
}

/** The name a site is known by: its first public `server_name`, else its folder or file. */
export function siteName(v: Pick<Rec<'vhost'>, 'names' | 'root' | 'file'>): string {
  const names = v.names.filter((n) => n !== '_' && !n.includes('*') && n.includes('.'))
  const first = names.find((n) => !n.toLowerCase().startsWith('www.')) ?? names[0]
  return first ?? v.names[0] ?? v.root ?? v.file
}

function sameRecord(a: SetupRecord, b: SetupRecord): boolean {
  if (a.rec !== b.rec) return false
  switch (a.rec) {
    case 'vhost':
      return a.file === (b as Rec<'vhost'>).file && siteName(a) === siteName(b as Rec<'vhost'>)
    case 'compose':
      return a.project === (b as Rec<'compose'>).project
    case 'pm2':
      return a.app === (b as Rec<'pm2'>).app && a.home === (b as Rec<'pm2'>).home
    case 'db': {
      const o = b as Rec<'db'>
      return a.engine === o.engine && a.origin === o.origin && a.name === o.name
    }
    default:
      return false
  }
}

/** Which suggested project holds a find, "unassigned" when the grouping left it out. */
export function projectOf(
  proposal: Proposal | null,
  host: string,
  record: SetupRecord,
): ProjectRef {
  if (!proposal) return null
  for (const p of proposal.projects) {
    for (const c of p.components) {
      if (c.host !== host) continue
      if (record.rec === 'compose' && c.kind === 'compose' && c.project === record.project) {
        return { id: p.id, name: p.name }
      }
      if (record.rec === 'pm2' && c.kind === 'pm2' && c.app === record.app) {
        return { id: p.id, name: p.name }
      }
      if (record.rec === 'db' && c.kind === 'db' && c.engine === record.engine) {
        const named = c.container ?? null
        if (record.origin === 'container' ? named === record.name : named === null) {
          return { id: p.id, name: p.name }
        }
      }
    }
    if (record.rec === 'vhost') {
      const hosts = new Set(p.urls.map(urlHost))
      if (record.names.some((n) => hosts.has(bareName(n)))) return { id: p.id, name: p.name }
    }
  }
  const loose = proposal.unassigned.some((u) => u.host === host && sameRecord(u.item, record))
  return loose ? 'unassigned' : null
}

// --- finds -----------------------------------------------------------------------------------

export type FindKind = 'vhost' | 'compose' | 'pm2' | 'db'

export interface Find {
  /** Stable for the life of the find, so a row is "new" once. */
  key: string
  kind: FindKind
  host: string
  title: string
  /** The catch-all server block, shown as "Default site" instead of its `_` name. */
  defaultSite: boolean
  record: SetupRecord
  project: ProjectRef
  /** Databases: the `.env` the grouping found for this server, so step 3 can prefill it. */
  envFound: boolean
  /** Databases: the default port of its engine when the host listens on it. */
  port: number | null
}

export interface FindColumns {
  sites: Find[]
  apps: Find[]
  boxes: Find[]
  dbs: Find[]
  /** Databases with a `.env` found. */
  dbEnv: number
}

const DB_PORT = { mysql: 3306, postgres: 5432 } as const

export function engineName(engine: Rec<'db'>['engine']): string {
  return engine === 'mysql' ? 'MySQL' : 'PostgreSQL'
}

function dbEnvFile(proposal: Proposal | null, host: string, r: Rec<'db'>): string {
  if (!proposal) return ''
  for (const p of proposal.projects) {
    for (const c of p.components) {
      if (c.kind !== 'db' || c.host !== host || c.engine !== r.engine) continue
      const named = c.container ?? null
      if (r.origin === 'container' ? named === r.name : named === null) return c.env_file
    }
  }
  return ''
}

export function findColumns(hosts: readonly HostRecords[], proposal: Proposal | null): FindColumns {
  const out: FindColumns = { sites: [], apps: [], boxes: [], dbs: [], dbEnv: 0 }
  for (const { host, records } of hosts) {
    const listening = new Set(records.flatMap((r) => (r.rec === 'port' ? [r.port] : [])))
    for (const r of records) {
      const project = projectOf(proposal, host, r)
      const base = { host, record: r, project, envFound: false, port: null, defaultSite: false }
      if (r.rec === 'vhost') {
        const title = siteName(r)
        out.sites.push({
          ...base,
          key: `${host}|vhost|${r.file}|${title}`,
          kind: 'vhost',
          title,
          defaultSite: isDefaultSite(r),
        })
      } else if (r.rec === 'compose') {
        out.boxes.push({
          ...base,
          key: `${host}|compose|${r.project}`,
          kind: 'compose',
          title: r.project,
        })
      } else if (r.rec === 'pm2') {
        out.apps.push({
          ...base,
          key: `${host}|pm2|${r.home}|${r.app}`,
          kind: 'pm2',
          title: r.app,
        })
      } else if (r.rec === 'db') {
        const envFound = dbEnvFile(proposal, host, r) !== ''
        const defaultPort = DB_PORT[r.engine]
        if (envFound) out.dbEnv += 1
        out.dbs.push({
          ...base,
          key: `${host}|db|${r.origin}|${r.name}|${r.engine}`,
          kind: 'db',
          title: engineName(r.engine),
          envFound,
          port: listening.has(defaultPort) ? defaultPort : null,
        })
      }
    }
  }
  return out
}

/** The port a site forwards to, as the sub line writes it: `:3000` for this machine. */
export function proxyTarget(proxy: string): string {
  const m = /^(?:127\.0\.0\.1|localhost|\[::1\]|0\.0\.0\.0)?:?(\d+)$/.exec(proxy)
  if (m) return `:${m[1]}`
  const local = /^(?:127\.0\.0\.1|localhost):(\d+)$/.exec(proxy)
  return local ? `:${local[1]}` : proxy
}

// --- listeners no find accounts for ----------------------------------------------------------

export interface Listening {
  key: string
  host: string
  port: number
  proc: string | null
  /** A database port open to the internet. */
  publicDb: boolean
}

const DB_PROCS = new Set(['mysqld', 'mariadbd', 'postgres'])

function proxyPort(proxy: string | null | undefined): number | null {
  const m = proxy ? /:(\d+)$/.exec(proxy) : null
  return m ? Number(m[1]) : null
}

/**
 * The listening ports no site, container or app accounts for: a block that forwards to it or
 * listens on it, a compose project that publishes it, a pm2 app running from the same folder,
 * or a database server the host runs. A database port that is public is kept either way.
 */
export function listeningLeft(hosts: readonly HostRecords[]): Listening[] {
  const out: Listening[] = []
  for (const { host, records } of hosts) {
    const taken = new Set<number>()
    const folders = new Set<string>()
    let hasDb = false
    for (const r of records) {
      if (r.rec === 'vhost') {
        r.listen.forEach((p) => taken.add(p))
        const p = proxyPort(r.proxy)
        if (p !== null) taken.add(p)
      } else if (r.rec === 'compose') {
        r.ports.forEach((p) => taken.add(p))
      } else if (r.rec === 'pm2' && r.cwd) {
        folders.add(r.cwd)
      } else if (r.rec === 'db') {
        hasDb = true
      }
    }
    for (const r of records) {
      if (r.rec !== 'port') continue
      const isDb =
        r.port === DB_PORT.mysql || r.port === DB_PORT.postgres || DB_PROCS.has(r.proc ?? '')
      const publicDb = isDb && r.bind === 'any'
      const accounted =
        taken.has(r.port) || (r.cwd != null && folders.has(r.cwd)) || (isDb && hasDb)
      if (accounted && !publicDb) continue
      out.push({ key: `${host}|${r.port}`, host, port: r.port, proc: r.proc ?? null, publicDb })
    }
  }
  return out
}

// --- pairs -----------------------------------------------------------------------------------

export interface PairSide {
  host: string
  port: number | null
}

export interface Pair {
  key: string
  project: string
  name: string
  be: PairSide
  fe: PairSide
  /** The two sit on different hosts, so the strip names the hosts. */
  apart: boolean
}

function portOfComponent(
  hosts: readonly HostRecords[],
  c: Proposal['projects'][number]['components'][number],
): number | null {
  const records = hosts.find((h) => h.host === c.host)?.records ?? []
  const ports = records.filter((r): r is Rec<'port'> => r.rec === 'port')
  if (c.kind === 'compose') {
    return (
      records.find((r): r is Rec<'compose'> => r.rec === 'compose' && r.project === c.project)
        ?.ports[0] ?? null
    )
  }
  // A folder is not something that listens, so only an app has a port of its own.
  const folder =
    c.kind === 'pm2'
      ? (records.find((r): r is Rec<'pm2'> => r.rec === 'pm2' && r.app === c.app)?.cwd ?? null)
      : null
  if (!folder) return null
  return ports.find((p) => p.cwd === folder)?.port ?? null
}

/** A front end and a back end of one project that run on other hosts or other ports. */
export function pairsOf(proposal: Proposal | null, hosts: readonly HostRecords[]): Pair[] {
  if (!proposal) return []
  const out: Pair[] = []
  for (const p of proposal.projects) {
    const fes = p.components.filter((c) => c.role === 'fe')
    const bes = p.components.filter((c) => c.role === 'be')
    for (const fe of fes) {
      for (const be of bes) {
        const fePort = portOfComponent(hosts, fe)
        const bePort = portOfComponent(hosts, be)
        const apart = fe.host !== be.host
        if (!apart && fePort === bePort) continue
        out.push({
          key: `${p.id}|${fe.host}|${fePort ?? ''}|${be.host}|${bePort ?? ''}`,
          project: p.id,
          name: p.name,
          be: { host: be.host, port: bePort },
          fe: { host: fe.host, port: fePort },
          apart,
        })
      }
    }
  }
  return out
}
