// The editable form of a project during setup and in the project sheet: what the user sees
// and changes, and the conversions to and from `Project` (what `projects.json` holds). Pure,
// so the setup store, the sheet and the tests share one definition.
import type { Component, DbEngine, Project, ProposedComponent, ProposedProject, Role } from '@/api'
import { MONOGRAM_TINTS, type MonogramTint } from '@/ui/monogram-tints'

/** The hex of each project colour: the end stop of its tint pair (`--tint-<name>-2`). */
export const PROJECT_COLORS: Record<MonogramTint, string> = {
  blue: '#4f6bed',
  lilac: '#8b6fe0',
  rose: '#d86a9a',
  amber: '#b96c0b',
  green: '#1c8f55',
  teal: '#138a8a',
  coral: '#d9603b',
  slate: '#5f6478',
}

/** The colour name of a stored `#rrggbb`, when it is one of the eight. */
export function colorName(hex: string | null | undefined): MonogramTint | null {
  const value = hex?.toLowerCase()
  return MONOGRAM_TINTS.find((name) => PROJECT_COLORS[name] === value) ?? null
}

/** The next colour in the order of the tints that no project in `used` has. */
export function nextColor(used: (string | null | undefined)[]): string {
  const taken = new Set(used.map((c) => c?.toLowerCase()))
  const free = MONOGRAM_TINTS.find((name) => !taken.has(PROJECT_COLORS[name]))
  return PROJECT_COLORS[free ?? MONOGRAM_TINTS[used.length % MONOGRAM_TINTS.length] ?? 'blue']
}

export type PartKind = 'path' | 'compose' | 'pm2' | 'db'

interface PartBase {
  /** Stable while the part is edited (list keys, drag and drop). */
  key: string
  role: Role
  host: string
}

export type DraftPart = PartBase &
  (
    | { kind: 'path'; path: string }
    | { kind: 'compose'; project: string }
    | { kind: 'pm2'; app: string; pm2Home: string | null }
    | {
        kind: 'db'
        engine: DbEngine
        /** Empty until the user types it: discover never reads a `.env`. */
        database: string
        /** Empty when no `.env` was found. */
        envFile: string
        container: string | null
      }
  )

export interface DraftProject {
  /** Stable while editing; the id may change until the first save. */
  key: string
  id: string
  name: string
  color: string | null
  urls: string[]
  parts: DraftPart[]
  /** Every `.env` found in it (a database part picks one of these). */
  envFiles: string[]
  /** Not saved yet (the "New" tag). */
  isNew: boolean
  /** The id of the suggestion this draft came from; sync matches on it, so renaming never duplicates. */
  origin: string
  /** The id still follows the name (nothing was typed in the id field, nothing was saved). */
  idFollowsName: boolean
}

let counter = 0
/** A key for a part or draft that has none yet. */
export function newKey(prefix = 'k'): string {
  counter += 1
  return `${prefix}${counter}`
}

/** `Tiem Tra!` → `tiem-tra`: lowercase letters, digits and dashes, the id the name suggests. */
export function slugId(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** What `projects.json` accepts as an id (the core's `is_plain_name`). */
export function isPlainName(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) && value.length <= 1024
}

export function isAbsPath(value: string): boolean {
  return value.startsWith('/') && value.length <= 1024 && !/[\u0000-\u001f\u007f]/.test(value)
}

const WORKER_WORDS = /(worker|queue|cron|job|scheduler|consumer)/i

/** The role a pm2 app or compose project is suggested for (`worker` by its name). */
export function roleForName(name: string, fallback: Role): Role {
  return WORKER_WORDS.test(name) ? 'worker' : fallback
}

function fromProposed(c: ProposedComponent, envFiles: string[]): DraftPart {
  const base = { key: newKey('p'), role: c.role, host: c.host }
  switch (c.kind) {
    case 'path':
      return { ...base, kind: 'path', path: c.path }
    case 'compose':
      return { ...base, kind: 'compose', project: c.project }
    case 'pm2':
      return { ...base, kind: 'pm2', app: c.app, pm2Home: c.pm2_home ?? null }
    case 'db':
      return {
        ...base,
        kind: 'db',
        engine: c.engine,
        database: '',
        envFile: envFiles.includes(c.env_file) ? c.env_file : (envFiles[0] ?? c.env_file),
        container: c.container ?? null,
      }
  }
}

/** A suggestion from discover as an editable project. */
export function draftFromProposed(p: ProposedProject, color: string | null): DraftProject {
  const envFiles = p.env_files.map((e) => e.path)
  return {
    key: newKey('d'),
    id: p.id,
    name: p.name,
    color,
    urls: [...p.urls],
    parts: p.components.map((c) => fromProposed(c, envFiles)),
    envFiles,
    isNew: true,
    origin: p.id,
    idFollowsName: false,
  }
}

function fromComponent(c: Component): DraftPart {
  const base = { key: newKey('p'), role: c.role, host: c.host }
  switch (c.kind) {
    case 'path':
      return { ...base, kind: 'path', path: c.path }
    case 'compose':
      return { ...base, kind: 'compose', project: c.project }
    case 'pm2':
      return { ...base, kind: 'pm2', app: c.app, pm2Home: c.pm2_home ?? null }
    case 'db':
      return {
        ...base,
        kind: 'db',
        engine: c.engine,
        database: c.database ?? '',
        envFile: c.env_file ?? '',
        container: c.container ?? null,
      }
  }
}

/** A saved project as an editable one: its id stays fixed. */
export function draftFromProject(p: Project): DraftProject {
  return {
    key: newKey('d'),
    id: p.id,
    name: p.name,
    color: p.color ?? null,
    urls: [...p.urls],
    parts: p.components.map(fromComponent),
    envFiles: [
      ...new Set(p.components.flatMap((c) => (c.kind === 'db' && c.env_file ? [c.env_file] : []))),
    ],
    isNew: false,
    origin: p.id,
    idFollowsName: false,
  }
}

/** An empty project for "New project". */
export function emptyDraft(color: string | null): DraftProject {
  return {
    key: newKey('d'),
    id: '',
    name: '',
    color,
    urls: [],
    parts: [],
    envFiles: [],
    isNew: true,
    origin: '',
    idFollowsName: true,
  }
}

/** Whether a database part cannot be saved yet (no name, or no `.env`). */
export function isIncomplete(part: DraftPart): boolean {
  return part.kind === 'db' && (part.database.trim() === '' || part.envFile.trim() === '')
}

function toComponent(part: DraftPart): Component {
  const base = { role: part.role, host: part.host }
  switch (part.kind) {
    case 'path':
      return { ...base, kind: 'path', path: part.path }
    case 'compose':
      return { ...base, kind: 'compose', project: part.project }
    case 'pm2':
      return {
        ...base,
        kind: 'pm2',
        app: part.app,
        ...(part.pm2Home ? { pm2_home: part.pm2Home } : {}),
      }
    case 'db': {
      // A database the user added is kept even before its name or .env is known;
      // its size is read once both are set.
      const database = part.database.trim()
      const envFile = part.envFile.trim()
      return {
        ...base,
        kind: 'db',
        engine: part.engine,
        ...(database ? { database } : {}),
        ...(envFile ? { env_file: envFile } : {}),
        ...(part.container ? { container: part.container } : {}),
      }
    }
  }
}

/** The project as `projects.json` holds it, and how many database parts lack a name or .env. */
export function draftToProject(d: DraftProject): { project: Project; incomplete: number } {
  const components = d.parts.map(toComponent)
  const incomplete = d.parts.filter(isIncomplete).length
  const project: Project = {
    id: d.id.trim(),
    name: d.name,
    urls: d.urls.map((u) => u.trim()).filter((u) => u !== ''),
    components,
    ...(d.color ? { color: d.color } : {}),
  }
  return { project, incomplete }
}

/** Every distinct host the drafts use, in first-use order (the servers of the footer count). */
export function hostsOf(drafts: readonly DraftProject[]): string[] {
  return [...new Set(drafts.flatMap((d) => d.parts.map((p) => p.host)))]
}

/** One line a part is known by: `pm2 tiemtra-web`, `compose tiemtra-api`, `/var/www/shop`. */
export function partName(part: DraftPart): string {
  switch (part.kind) {
    case 'path':
      return part.path
    case 'compose':
      return part.project
    case 'pm2':
      return part.app
    case 'db':
      return part.container ?? part.engine
  }
}

/** Two parts are the same thing on the same host (what the core calls a duplicate). */
export function samePart(a: DraftPart, b: DraftPart): boolean {
  if (a.host !== b.host || a.kind !== b.kind) return false
  return partName(a) === partName(b) && (a.kind !== 'db' || a.envFile === (b as typeof a).envFile)
}

const PREVIEW_LIMIT = 24

/**
 * The text of `projects.json` as the board draws it: the first project in full, the others as
 * one line each with their part count; no secret can be in it, parts are names and paths.
 */
export function previewLines(drafts: readonly DraftProject[]): string[] {
  const out: string[] = ['{', '  "version": 1,', '  "projects": [']
  drafts.forEach((d, index) => {
    const { project } = draftToProject(d)
    const last = index === drafts.length - 1
    const comma = last ? '' : ','
    if (index === 0) {
      out.push('    {', `      "id": ${JSON.stringify(project.id)},`)
      out.push(`      "urls": ${JSON.stringify(project.urls)},`, '      "components": [')
      project.components.forEach((c, i) => {
        const tail = i === project.components.length - 1 ? ' }' : ' },'
        out.push(`        ${componentLine(c)}${tail}`)
      })
      out.push('      ]', `    }${comma}`)
    } else {
      const n = project.components.length
      out.push(`    { "id": ${JSON.stringify(project.id)}, … ${n} parts }${comma}`)
    }
  })
  out.push('  ]', '}')
  return out.slice(0, PREVIEW_LIMIT)
}

function componentLine(c: Component): string {
  const head = `{ "role": "${c.role}", "host": ${JSON.stringify(c.host)}, "kind": "${c.kind}"`
  switch (c.kind) {
    case 'path':
      return `${head}, "path": ${JSON.stringify(c.path)}`
    case 'compose':
      return `${head}, "project": ${JSON.stringify(c.project)}`
    case 'pm2':
      return `${head}, "app": ${JSON.stringify(c.app)}`
    case 'db': {
      const name = c.database ? `, "database": ${JSON.stringify(c.database)}` : ''
      const env = c.env_file ? `, "env_file": ${JSON.stringify(c.env_file)}` : ''
      return `${head}, "engine": "${c.engine}"${name}${env}`
    }
  }
}
