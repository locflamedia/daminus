// What the "Confirm your projects" screen decides from the drafts and the discover records:
// which project is looked at first, what each part says about itself, the checklist, the
// pairing line, the leftovers grouped by host. Pure: it returns message keys with params, the
// screen turns them into words. Nothing here is invented; a line with no record behind it is
// not produced.
import type { Role, SaveOutcome, SetupRecord } from '@/api'
import type { LooseItem } from '@/stores/setup-drafts'
import { type DraftPart, type DraftProject, hostsOf, isIncomplete } from '@/lib/setup-model'

/** A sentence for the screen to translate. */
export interface Words {
  key: string
  params: Record<string, string | number>
  /** Plural count, when the message has forms. */
  n?: number
}

const base = 'setupGroup.'
const words = (key: string, params: Words['params'] = {}, n?: number): Words => ({
  key: base + key,
  params,
  ...(n === undefined ? {} : { n }),
})

// --- which project is looked at first ---------------------------------------------------

export function incompleteParts(d: DraftProject): DraftPart[] {
  return d.parts.filter(isIncomplete)
}

/** The project is missing something the user can fill in (a database part without a name). */
export function needsAttention(d: DraftProject): boolean {
  return d.parts.some(isIncomplete)
}

/**
 * The cards in the order they are shown: the ones that need a look first, the rest as they
 * came. `pinned` keeps a card where it was once it was shown at the top, so finishing a
 * database part does not move the card away from under the cursor.
 */
export function orderForGroup(
  drafts: readonly DraftProject[],
  pinned: ReadonlySet<string> = new Set(),
): DraftProject[] {
  const first = (d: DraftProject) => needsAttention(d) || pinned.has(d.key)
  return [...drafts.filter(first), ...drafts.filter((d) => !first(d))]
}

// --- one part ---------------------------------------------------------------------------

export type SourceKind = 'path' | 'pm2' | 'compose' | 'container' | 'engine'

/** "path /var/www/shop", "pm2 shop-web", "container shop-db-1", "engine mysql". */
export function partSource(part: DraftPart): { kind: SourceKind; name: string } {
  switch (part.kind) {
    case 'path':
      return { kind: 'path', name: part.path }
    case 'pm2':
      return { kind: 'pm2', name: part.app }
    case 'compose':
      return { kind: 'compose', name: part.project }
    case 'db':
      return part.container
        ? { kind: 'container', name: part.container }
        : { kind: 'engine', name: part.engine }
  }
}

const DB_PROCESSES: Record<string, RegExp> = {
  mysql: /^(mysqld|mariadbd|mysqld_safe)$/,
  postgres: /^(postgres|postmaster)$/,
}

/** The port a database process of `engine` listens on, from the port records of its host. */
export function dbPort(engine: string, records: readonly SetupRecord[]): number | null {
  const pattern = DB_PROCESSES[engine]
  if (!pattern) return null
  for (const r of records) {
    if (r.rec === 'port' && r.proc && pattern.test(r.proc)) return r.port
  }
  return null
}

/** "mysql · :3306" for an engine part: the engine, and its port when discover saw it. */
export function engineName(part: DraftPart, records: readonly SetupRecord[]): string {
  if (part.kind !== 'db' || part.container) return partSource(part).name
  const port = dbPort(part.engine, records)
  return port === null ? part.engine : `${part.engine} · :${port}`
}

export interface LiveText {
  words: Words
  tone: 'ok' | 'warn'
}

function samePath(root: string, path: string): boolean {
  return root === path || root.startsWith(path.endsWith('/') ? path : path + '/')
}

/**
 * What discover saw of this part, as a line for its row: pm2 status and instances, how many
 * services of a compose project are up, the nginx site that serves a folder, the `.env` of a
 * database. `null` when no record says anything about it.
 */
export function liveText(part: DraftPart, records: readonly SetupRecord[]): LiveText | null {
  switch (part.kind) {
    case 'pm2': {
      const app = records.find(
        (r) => r.rec === 'pm2' && r.app === part.app && (!part.pm2Home || r.home === part.pm2Home),
      )
      if (app?.rec !== 'pm2') return null
      return {
        tone: app.status === 'online' ? 'ok' : 'warn',
        words: words('live.pm2', { status: app.status }, app.instances),
      }
    }
    case 'compose': {
      const c = records.find((r) => r.rec === 'compose' && r.project === part.project)
      if (c?.rec !== 'compose') return null
      return c.running === c.total
        ? { tone: 'ok', words: words('live.composeUp', {}, c.total) }
        : { tone: 'warn', words: words('live.composePart', { up: c.running, total: c.total }) }
    }
    case 'path': {
      const site = records.find((r) => r.rec === 'vhost' && r.root && samePath(r.root, part.path))
      if (site?.rec !== 'vhost') return null
      return { tone: 'ok', words: words(site.php ? 'live.sitePhp' : 'live.site') }
    }
    case 'db': {
      if (isIncomplete(part)) return null
      const listed = records.some((r) => r.rec === 'env' && r.path === part.envFile)
      return {
        tone: 'ok',
        words: words(listed ? 'live.dbEnv' : 'live.dbEngine', { engine: part.engine }),
      }
    }
  }
}

// --- one project ------------------------------------------------------------------------

export function roleSet(d: DraftProject): Role[] {
  return [...new Set(d.parts.map((p) => p.role))]
}

/** Hosts of the project in first-use order. */
export function projectHosts(d: DraftProject): string[] {
  return hostsOf([d])
}

/** The line a collapsed card shows under its header: what each part is. */
export function foldedParts(d: DraftProject): { kind: SourceKind; name: string; host: string }[] {
  return d.parts.map((p) => ({ ...partSource(p), host: p.host }))
}

/** What "Save replaces it" replaces, counted from the draft. */
export function replacedCounts(d: DraftProject): { urls: number; parts: number } {
  return { urls: d.urls.filter((u) => u.trim() !== '').length, parts: d.parts.length }
}

/**
 * "BE serves khohang.vn, FE on :5173, DB on the same host": only the pieces the records
 * support, and only for a project that has a front end and a back end.
 */
export function pairingLine(
  d: DraftProject,
  recordsOf: (host: string) => readonly SetupRecord[],
): Words[] {
  const be = d.parts.find((p) => p.role === 'be')
  const fe = d.parts.find((p) => p.role === 'fe')
  if (!be || !fe) return []
  const out: Words[] = []
  const first = d.urls[0]?.trim()
  if (first) out.push(words('pair.beServes', { url: urlHost(first) }))
  const port = fe.kind === 'pm2' ? portOfApp(fe, recordsOf(fe.host)) : null
  if (port !== null) out.push(words('pair.fePort', { port }))
  const db = d.parts.find((p) => p.role === 'db')
  if (db) {
    out.push(
      db.host === be.host || db.host === fe.host
        ? words('pair.dbSame')
        : words('pair.dbOn', { host: db.host }),
    )
  }
  return out
}

function urlHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** The port a pm2 app listens on: the port record whose process runs from the app's folder. */
function portOfApp(part: DraftPart, records: readonly SetupRecord[]): number | null {
  if (part.kind !== 'pm2') return null
  const app = records.find((r) => r.rec === 'pm2' && r.app === part.app)
  const cwd = app?.rec === 'pm2' ? app.cwd : null
  if (!cwd) return null
  const hit = records.find((r) => r.rec === 'port' && r.cwd === cwd)
  return hit?.rec === 'port' ? hit.port : null
}

// --- the checklist ----------------------------------------------------------------------

export interface CheckLine {
  id: 'urls' | 'roles' | 'databases'
  ok: boolean
  words: Words
}

/** The three lines of "Before you save", computed from the drafts. */
export function checklist(drafts: readonly DraftProject[]): CheckLine[] {
  const noUrl = drafts.filter((d) => !d.urls.some((u) => u.trim() !== '')).length
  const noApp = drafts.filter(
    (d) => d.parts.length > 0 && !d.parts.some((p) => p.role === 'fe' || p.role === 'be'),
  ).length
  const parts = drafts.flatMap((d) => d.parts)
  const noEnv = parts.filter((p) => p.kind === 'db' && p.envFile.trim() === '').length
  const noName = parts.filter(
    (p) => p.kind === 'db' && p.envFile.trim() !== '' && p.database.trim() === '',
  ).length
  return [
    {
      id: 'urls',
      ok: noUrl === 0,
      words: noUrl === 0 ? words('check.urls') : words('check.urlsMissing', { n: noUrl }, noUrl),
    },
    {
      id: 'roles',
      ok: noApp === 0,
      words: noApp === 0 ? words('check.roles') : words('check.rolesMissing', { n: noApp }, noApp),
    },
    {
      id: 'databases',
      ok: noEnv + noName === 0,
      words:
        noEnv > 0
          ? words('check.dbNoEnv', { n: noEnv }, noEnv)
          : noName > 0
            ? words('check.dbNoName', { n: noName }, noName)
            : words('check.databases'),
    },
  ]
}

// --- Not in a project -------------------------------------------------------------------

const KIND_ORDER: LooseItem['kind'][] = ['vhost', 'compose', 'pm2', 'db', 'env', 'path']

export interface LooseGroup {
  host: string
  items: LooseItem[]
}

/** The leftovers by host (first seen first) and, inside a host, by kind. */
export function groupLoose(items: readonly LooseItem[]): LooseGroup[] {
  const hosts = [...new Set(items.map((i) => i.host))]
  return hosts.map((host) => ({
    host,
    items: items
      .filter((i) => i.host === host)
      .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)),
  }))
}

/** The detail line of a leftover. */
export function looseDetail(item: LooseItem): Words {
  const { code, n, text } = item.detail
  switch (code) {
    case 'no_site':
      return words('loose.noSite', { n: n ?? 0 }, n ?? 0)
    case 'runs_from':
      return words('loose.runsFrom', { dir: text ?? '' })
    case 'container':
      return words('loose.container', { name: text ?? '' })
    default:
      return words(`loose.${code}`)
  }
}

// --- saving -----------------------------------------------------------------------------

/** How many warnings a saved outcome carries (errors reject the save). */
export function warningCount(outcome: SaveOutcome): number {
  return outcome.issues.filter((i) => i.level === 'warning').length
}

// --- the projects.json preview ----------------------------------------------------------

export interface JsonSegment {
  text: string
  kind: 'key' | 'str' | 'num' | 'punct'
}

const JSON_PIECE = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?)|([^"\d-]+|[\d-])/gy

/** One line of the preview split into colours: keys, strings, numbers, everything else. */
export function jsonSegments(line: string): JsonSegment[] {
  const out: JsonSegment[] = []
  JSON_PIECE.lastIndex = 0
  for (let m = JSON_PIECE.exec(line); m !== null; m = JSON_PIECE.exec(line)) {
    const [, quoted, colon, num, rest] = m
    if (quoted !== undefined) {
      out.push({ text: quoted, kind: colon ? 'key' : 'str' })
      if (colon) out.push({ text: colon, kind: 'punct' })
    } else if (num !== undefined) out.push({ text: num, kind: 'num' })
    else if (rest !== undefined) out.push({ text: rest, kind: 'punct' })
  }
  return out
}

/** The keys of the lines that are new or moved since `before`, so the screen can wash them. */
export function changedLines(before: readonly string[], after: readonly string[]): Set<number> {
  const out = new Set<number>()
  after.forEach((line, i) => {
    if (before[i] !== line) out.add(i)
  })
  return out
}

/** `shop` taken → `shop-2`, then `shop-3`: the id "Keep both" gives (the store does the same). */
export function freeId(id: string, taken: ReadonlySet<string>): string {
  let n = 2
  while (taken.has(`${id}-${n}`)) n += 1
  return `${id}-${n}`
}
