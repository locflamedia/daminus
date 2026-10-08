// The Database tab's model: a `db.size` fact as engine, size, tables and the largest tables with
// their change since the previous scan, and which of the four "cannot read it" states an unknown
// result is. Only sizes and counts exist in the core's data; nothing else about the server does.
import type { Item, ScanFact } from '@/api'
import { dataOf, num, pairs, str } from './project-facts'
import { factsFor, valueSeries, type SeriesPoint } from './project-series'

export type DbEngineName = 'mysql' | 'postgres' | 'other'

export interface DbTable {
  name: string
  bytes: number
  /** Change since the previous scan; `null` when that scan did not list the table. */
  delta: number | null
  /** Share of the largest table, 0 to 1. */
  share: number
}

export interface DbView {
  item: Item
  host: string
  database: string
  engine: DbEngineName
  size: number | null
  tables: number | null
  top: { name: string; bytes: number }[]
}

export function engineOf(raw: unknown): DbEngineName {
  return raw === 'mysql' || raw === 'postgres' ? raw : 'other'
}

export function parseDb(item: Item): DbView | null {
  if (!item.fact || item.fact.unknown) return null
  const data = dataOf(item.fact)
  return {
    item,
    host: item.key.host,
    database: item.key.target,
    engine: engineOf(str(data.engine)),
    size: num(item.fact.value),
    tables: num(data.tables),
    top: pairs(data.top),
  }
}

/** Largest tables as bars scaled to the biggest, with the change against the last scan's list. */
export function tableRows(
  top: readonly { name: string; bytes: number }[],
  previous: ReadonlyMap<string, number>,
): DbTable[] {
  const max = Math.max(1, ...top.map((t) => t.bytes))
  return top.map((t) => {
    const before = previous.get(t.name)
    return {
      name: t.name,
      bytes: t.bytes,
      delta: before === undefined ? null : t.bytes - before,
      share: t.bytes / max,
    }
  })
}

/** The table that grew most since the last scan: it is drawn amber. `null` when none grew. */
export function growingTable(rows: readonly DbTable[]): string | null {
  let best: DbTable | null = null
  for (const r of rows) if ((r.delta ?? 0) > (best?.delta ?? 0)) best = r
  return best?.name ?? null
}

/** Facts of this database across scans, oldest first. */
export function dbFacts(facts: readonly ScanFact[], view: Pick<DbView, 'host' | 'database'>) {
  return factsFor(facts, { check: 'db.size', host: view.host, target: view.database })
}

/** The facts of the scan before `seq`; `undefined` when there is none. */
export function previousFact(facts: readonly ScanFact[], seq: number): ScanFact | undefined {
  return [...facts].reverse().find((f) => f.seq < seq)
}

/** The biggest single step up between two scans, for the sentence under the curve. */
export function biggestStep(points: readonly SeriesPoint[]): { seq: number; bytes: number } | null {
  let best: { seq: number; bytes: number } | null = null
  for (let i = 1; i < points.length; i++) {
    const bytes = (points[i]?.value ?? 0) - (points[i - 1]?.value ?? 0)
    if (bytes > 0 && bytes > (best?.bytes ?? 0)) best = { seq: points[i]?.seq ?? 0, bytes }
  }
  return best
}

export const sizeSeries = (facts: readonly ScanFact[]) => valueSeries(facts)

export type DbProblem = 'permission' | 'refused' | 'unsupported' | 'missing'

/**
 * Which state an unknown `db.size` is. The core reports an exit code only, so a `.env` that
 * cannot be read, a refused login and an unreachable server share `needs_perm`, and a missing
 * `.env`, client or container share `missing`; those two states say so instead of guessing.
 */
export function dbProblem(item: Item): DbProblem | null {
  if (item.severity.level !== 'unknown') return null
  switch (item.severity.reason) {
    case 'needs_perm':
      return 'permission'
    case 'unsupported':
      return 'unsupported'
    case 'missing':
      return 'missing'
    default:
      return 'refused'
  }
}

/** The keys of a `.env` Daminus reads. */
export const ENV_KEYS = [
  'DB_CONNECTION',
  'DB_HOST',
  'DB_PORT',
  'DB_DATABASE',
  'DB_USERNAME',
  'DB_PASSWORD',
] as const

/** Name shapes Daminus accepts in a `.env`, as the unsupported state lists them. */
export const ENV_FORMS = ['DB_*', 'MYSQL_*', 'POSTGRES_*', 'DATABASE_URL'] as const

/** A path or name that is safe to paste inside a shell command. */
const SAFE_PATH = /^[A-Za-z0-9/._-]+$/

export function isSafePath(value: string): boolean {
  return SAFE_PATH.test(value)
}

/** The command a person runs to see who owns the `.env`; `null` for a path that is not plain. */
export function listEnvCommand(host: string, envFile: string): string | null {
  return isSafePath(host) && isSafePath(envFile) ? `ssh ${host} "ls -l ${envFile}"` : null
}

/** The command that tries the login by hand (the values are the user's to type). */
export function tryLoginCommand(host: string, engine: DbEngineName): string | null {
  if (!isSafePath(host)) return null
  return engine === 'postgres'
    ? `ssh -t ${host} psql -h DB_HOST -U DB_USERNAME -d DB_DATABASE`
    : `ssh -t ${host} mysql -h DB_HOST -u DB_USERNAME -p`
}

/** Add the SSH user to the group that owns the `.env`; the names are the person's to fill in. */
export const GROUP_COMMAND = 'sudo usermod -aG FILE_GROUP SSH_USER'

/** One sudoers line that lets the SSH user read just this file as its owner. */
export function sudoRuleLine(envFile: string): string | null {
  return isSafePath(envFile) ? `SSH_USER ALL=(FILE_OWNER) NOPASSWD: /usr/bin/cat ${envFile}` : null
}
