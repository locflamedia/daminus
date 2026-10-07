// The parts of a project in the sheet: what "Add part" offers, the suggestions a new part can
// pick from (what discover found on its host), and what is known about a part from those
// finds. Everything here comes from discover records; with none, the lists are empty and the
// part is typed by hand.
import type { ComposeProject, DbEngine, Pm2App, Role, SetupRecord, Vhost } from '@/api'
import {
  type DraftPart,
  type DraftProject,
  isAbsPath,
  isIncomplete,
  newKey,
  partName,
  roleForName,
} from './setup-model'

export type AddKind = 'folder' | 'compose' | 'pm2' | 'database' | 'nginx'

/** The kinds in the order of the menu. */
export const ADD_KINDS: readonly AddKind[] = ['folder', 'compose', 'pm2', 'database', 'nginx']

export interface DiscoveredOn {
  compose: ComposeProject[]
  pm2: Pm2App[]
  vhosts: Vhost[]
}

export function discoveredOn(records: readonly SetupRecord[]): DiscoveredOn {
  const out: DiscoveredOn = { compose: [], pm2: [], vhosts: [] }
  for (const r of records) {
    if (r.rec === 'compose') out.compose.push(r)
    else if (r.rec === 'pm2') out.pm2.push(r)
    else if (r.rec === 'vhost') out.vhosts.push(r)
  }
  return out
}

/** How many finds a kind has, for the "3 found" hint; `null` for kinds that are not listed. */
export function foundCount(kind: AddKind, found: DiscoveredOn): number | null {
  if (kind === 'compose') return found.compose.length
  if (kind === 'pm2') return found.pm2.length
  if (kind === 'nginx') return found.vhosts.length
  return null
}

/**
 * The server a new part of `kind` starts on: the first of `hosts` where discover found one,
 * else `fallback` (then the part is typed by hand).
 */
export function hostForKind(
  kind: AddKind,
  hosts: readonly string[],
  recordsOf: (host: string) => readonly SetupRecord[],
  fallback: string,
): string {
  return hosts.find((h) => (foundCount(kind, discoveredOn(recordsOf(h))) ?? 0) > 0) ?? fallback
}

/** The part a menu choice starts with: empty, to be filled by typing or picking. */
export function newPart(kind: AddKind, host: string, engine: DbEngine = 'postgres'): DraftPart {
  const base = { key: newKey('p'), host }
  switch (kind) {
    case 'folder':
    case 'nginx':
      return { ...base, role: 'be', kind: 'path', path: '' }
    case 'compose':
      return { ...base, role: 'be', kind: 'compose', project: '' }
    case 'pm2':
      return { ...base, role: 'fe', kind: 'pm2', app: '', pm2Home: null }
    case 'database':
      return {
        ...base,
        role: 'db',
        kind: 'db',
        engine,
        database: '',
        envFile: '',
        container: null,
      }
  }
}

export interface Suggestion {
  key: string
  /** What goes into the field. */
  name: string
  /** A pm2 app that runs, a stack that is up; drawn with a green dot. */
  live: boolean
  note: { code: 'pm2' | 'compose' | 'site'; n?: number; total?: number; text?: string }
  /** Already a part of this project: listed, but not offered. */
  taken: boolean
  role?: Role
  pm2Home?: string | null
}

/** What a part of `kind` can pick on its host, marking what the project already has. */
export function suggestionsFor(
  kind: 'compose' | 'pm2' | 'path',
  found: DiscoveredOn,
  parts: readonly DraftPart[],
  host: string,
  own?: DraftPart,
): Suggestion[] {
  const have = (name: string, k: DraftPart['kind']) =>
    parts.some((p) => p !== own && p.host === host && p.kind === k && partName(p) === name)
  if (kind === 'compose') {
    return found.compose.map((c) => ({
      key: `c|${c.project}`,
      name: c.project,
      live: c.running > 0,
      note: { code: 'compose', n: c.running, total: c.total },
      taken: have(c.project, 'compose'),
    }))
  }
  if (kind === 'pm2') {
    return found.pm2.map((a) => ({
      key: `p|${a.home}|${a.app}`,
      name: a.app,
      live: a.status === 'online',
      note: { code: 'pm2', n: a.instances, text: a.status },
      taken: have(a.app, 'pm2'),
      pm2Home: a.default ? null : a.home,
    }))
  }
  return found.vhosts.flatMap((v) =>
    v.root && isAbsPath(v.root)
      ? [
          {
            key: `v|${v.file}|${v.root}`,
            name: v.root,
            live: false,
            note: { code: 'site' as const, text: v.names[0] ?? v.file },
            taken: have(v.root, 'path'),
          },
        ]
      : [],
  )
}

/** The part with a suggestion picked; a worker-like pm2 app or stack becomes a worker. */
export function applySuggestion(part: DraftPart, pick: Suggestion): DraftPart {
  switch (part.kind) {
    case 'pm2':
      return {
        ...part,
        app: pick.name,
        pm2Home: pick.pm2Home ?? null,
        role: roleForName(pick.name, part.role),
      }
    case 'compose':
      return { ...part, project: pick.name, role: roleForName(pick.name, part.role) }
    case 'path':
      return { ...part, path: pick.name }
    case 'db':
      return part
  }
}

export type PartState =
  | { code: 'pm2'; online: boolean; status: string; instances: number }
  | { code: 'compose'; running: number; total: number }

/** What the finds say about a part, or `null` when they know nothing of it. */
export function partState(part: DraftPart, records: readonly SetupRecord[]): PartState | null {
  const found = discoveredOn(records)
  if (part.kind === 'pm2') {
    const app = found.pm2.find(
      (a) => a.app === part.app && (part.pm2Home ? a.home === part.pm2Home : a.default),
    )
    return app
      ? {
          code: 'pm2',
          online: app.status === 'online',
          status: app.status,
          instances: app.instances,
        }
      : null
  }
  if (part.kind === 'compose') {
    const stack = found.compose.find((c) => c.project === part.project)
    return stack ? { code: 'compose', running: stack.running, total: stack.total } : null
  }
  return null
}

/** A part with nothing typed in it yet: left out of the save, like a half-filled database. */
export function isBlank(part: DraftPart): boolean {
  if (part.kind === 'db') return isIncomplete(part)
  return partName(part).trim() === ''
}

/** The path a part holds that must be absolute: a folder, or the `.env` of a database. */
function pathOf(part: DraftPart): string | null {
  if (part.kind === 'path') return part.path
  if (part.kind === 'db') return part.envFile
  return null
}

/** A typed path that is not absolute: the sheet says so and does not save. */
export function badPath(part: DraftPart): boolean {
  const path = pathOf(part)?.trim() ?? ''
  return path !== '' && !isAbsPath(path)
}

/** The project as it will be saved: without the parts that are still blank. */
export function savable(draft: DraftProject): DraftProject {
  return { ...draft, parts: draft.parts.filter((p) => !isBlank(p)) }
}
