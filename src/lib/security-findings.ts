// The findings of the Security tab: what the nine checks found for one project, grouped the
// way a person thinks of them (one card for the PHP files of an uploads folder, one for a
// served `.env`) and carrying only evidence the facts hold: paths, sizes, counts and key
// names, never a value. Critical findings become cards, the rest fold into one line each.
// Severity, expected and stale are the core's; nothing here grades a result.
import type { ExpectedRule, Item } from '@/api'
import { dataOf, num, pathTimes, str, strings, valueOf } from './security-data'
import { isSecurityCheck, type Msg, type SecurityCheck } from './security-rows'
import { tlsState } from './tls-state'

export type FindingLevel = 'crit' | 'warn' | 'info'
export type FindingStanding = 'active' | 'expected' | 'stale'

export interface FileEvidence {
  path: string
  size: number | null
  mtime: number | null
  owner: string | null
}

export type Evidence =
  | {
      kind: 'files'
      host: string
      files: FileEvidence[]
      /** What the check found in the folder; the list holds at most the 50 newest. */
      total: number
    }
  | { kind: 'exposed'; url: string; files: { path: string; keys: string[] }[] }
  | {
      kind: 'miner'
      name: string
      exe: string | null
      deleted: boolean
      seen: number | null
      total: number | null
    }
  | { kind: 'port'; target: string; proc: string | null }
  | { kind: 'recent'; total: number; files: { path: string; mtime: number }[] }
  | { kind: 'preload'; entries: number; libs: string[] }
  | { kind: 'tls'; item: Item }
  | { kind: 'http'; url: string; status: number | null; ms: number | null; why: string | null }

export interface Finding {
  id: string
  check: SecurityCheck
  level: FindingLevel
  standing: FindingStanding
  /** The expected rule that covers the finding. */
  ruleId: string | null
  /** The scan the finding was last really checked in, when it is not the latest. */
  staleSince: number | null
  items: Item[]
  /** A message key under `projectSecurity.title`. */
  title: Msg
  evidence: Evidence
  /** The scan the finding first appeared in; `null` when this scan is the first. */
  firstSeq: number | null
  isNew: boolean
}

export interface Root {
  host: string
  path: string
}

export interface FindingContext {
  roots: readonly Root[]
  /** The latest scan number. */
  seq: number | null
}

const CHECK_ORDER: readonly SecurityCheck[] = [
  'sec.miner',
  'sec.preload',
  'sec.upload_php',
  'url.exposed',
  'sec.tmp_exec',
  'sec.ports',
  'url.tls',
  'url.http',
  'sec.recent_change',
]

const LEVEL_RANK: Record<FindingLevel, number> = { crit: 0, warn: 1, info: 2 }

function levelOf(item: Item): FindingLevel | null {
  const level = item.severity.level
  return level === 'crit' || level === 'warn' || level === 'info' ? level : null
}

function standingOf(item: Item): FindingStanding {
  return item.disposition.kind
}

/** The project folder a result path belongs to: the longest root on its host that holds it. */
export function folderOf(item: Item, roots: readonly Root[]): string {
  const target = item.key.target
  let best = ''
  for (const root of roots) {
    if (root.host !== item.key.host) continue
    const prefix = root.path.endsWith('/') ? root.path : `${root.path}/`
    if (target.startsWith(prefix) && root.path.length > best.length) best = root.path
  }
  if (best) return best
  const cut = target.search(/\/(?:uploads|storage)\//)
  return cut > 0 ? target.slice(0, cut) : target.slice(0, Math.max(0, target.lastIndexOf('/')))
}

function fileOf(item: Item): FileEvidence {
  const data = dataOf(item)
  return {
    path: item.key.target,
    size: num(data.size) ?? null,
    mtime: num(data.mtime) ?? null,
    owner: str(data.owner) ?? null,
  }
}

function newestFirst(files: FileEvidence[]): FileEvidence[] {
  return [...files].sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0))
}

function standingKey(item: Item): string {
  const d = item.disposition
  return d.kind === 'stale' ? `stale${d.since_seq}` : d.kind
}

function firstSeqOf(items: readonly Item[], seq: number | null): number | null {
  if (seq === null) return null
  let open = 0
  for (const item of items) {
    if (item.delta?.kind === 'still') open = Math.max(open, item.delta.scans_open)
  }
  return open > 1 ? Math.max(1, seq - open + 1) : null
}

function portTitle(port: number | undefined, target: string): Msg {
  const known = [3306, 5432, 6379, 27017, 2375]
  return port !== undefined && known.includes(port)
    ? { key: `port${port}` }
    : { key: 'portOther', params: { port: port ?? target } }
}

function tlsTitle(item: Item): Msg {
  const state = tlsState(item)
  let host = item.key.target
  try {
    host = new URL(item.key.target).hostname
  } catch {
    // The target is shown as it is when it is not a URL.
  }
  const first = state.flags[0]
  const key =
    first === 'expired'
      ? 'tlsExpired'
      : first === 'untrusted'
        ? 'tlsUntrusted'
        : first === 'mismatch'
          ? 'tlsMismatch'
          : 'tlsSoon'
  return { key, params: { host } }
}

function hostOfUrl(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function base(
  check: SecurityCheck,
  group: readonly Item[],
  ctx: FindingContext,
  idPart: string,
): Pick<
  Finding,
  'id' | 'check' | 'level' | 'standing' | 'ruleId' | 'staleSince' | 'items' | 'firstSeq' | 'isNew'
> {
  const worst =
    [...group].sort(
      (a, b) => LEVEL_RANK[levelOf(a) ?? 'info'] - LEVEL_RANK[levelOf(b) ?? 'info'],
    )[0] ?? (group[0] as Item)
  const disposition = worst.disposition
  const level = levelOf(worst) ?? 'info'
  return {
    id: `${check}:${idPart}:${standingKey(worst)}`,
    check,
    level,
    standing: standingOf(worst),
    ruleId: disposition.kind === 'expected' ? disposition.rule : null,
    staleSince: disposition.kind === 'stale' ? disposition.since_seq : null,
    items: [...group],
    firstSeq: firstSeqOf(group, ctx.seq),
    isNew: group.some((i) => i.delta?.kind === 'new'),
  }
}

function filesFindings(
  check: 'sec.upload_php' | 'sec.tmp_exec',
  items: Item[],
  ctx: FindingContext,
) {
  const groups = new Map<string, Item[]>()
  for (const item of items) {
    const key = `${item.key.host}\0${check === 'sec.upload_php' ? folderOf(item, ctx.roots) : ''}\0${standingKey(item)}`
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return [...groups.entries()].map(([key, group]): Finding => {
    const files = newestFirst(group.map(fileOf))
    const total = Math.max(files.length, ...group.map((i) => num(dataOf(i).total) ?? 0))
    return {
      ...base(check, group, ctx, key),
      title: { key: check === 'sec.upload_php' ? 'uploadPhp' : 'tmpExec', params: { n: total } },
      evidence: { kind: 'files', host: group[0]?.key.host ?? '', files, total },
    }
  })
}

function exposedFinding(item: Item, ctx: FindingContext): Finding {
  const keys = strings(dataOf(item).matched_keys)
  const byFile = new Map<string, string[]>()
  for (const entry of keys) {
    const cut = entry.indexOf(':')
    const path = cut < 0 ? entry : entry.slice(0, cut)
    const name = cut < 0 ? '' : entry.slice(cut + 1)
    byFile.set(path, [...(byFile.get(path) ?? []), ...(name ? [name] : [])])
  }
  const files = [...byFile.entries()].map(([path, names]) => ({ path, keys: names }))
  const label = files
    .map((f) => (f.path.startsWith('/.git') ? '.git' : f.path.replace(/^\//, '')))
    .filter((v, i, all) => all.indexOf(v) === i)
    .join(' + ')
  return {
    ...base('url.exposed', [item], ctx, item.key.target),
    title: { key: 'exposed', params: { file: label || item.key.target } },
    evidence: { kind: 'exposed', url: item.key.target, files },
  }
}

function minerFinding(item: Item, ctx: FindingContext): Finding {
  const data = dataOf(item)
  const name = item.key.target || str(data.exe) || ''
  return {
    ...base('sec.miner', [item], ctx, name),
    title: { key: 'miner', params: { name } },
    evidence: {
      kind: 'miner',
      name,
      exe: str(data.exe) ?? null,
      deleted: data.deleted === true,
      seen: num(data.seen) ?? null,
      total: num(data.total) ?? null,
    },
  }
}

function singleFinding(item: Item, ctx: FindingContext): Finding | null {
  const check = item.key.check
  if (!isSecurityCheck(check)) return null
  const data = dataOf(item)
  const common = base(check, [item], ctx, item.key.target)
  switch (check) {
    case 'sec.preload':
      return {
        ...common,
        title: { key: 'preload' },
        evidence: {
          kind: 'preload',
          entries: num(data.entries) ?? valueOf(item) ?? 0,
          libs: strings(data.libs),
        },
      }
    case 'sec.ports':
      return {
        ...common,
        title: portTitle(num(data.port), item.key.target),
        evidence: { kind: 'port', target: item.key.target, proc: str(data.proc) ?? null },
      }
    case 'sec.recent_change': {
      const total = valueOf(item) ?? 0
      return {
        ...common,
        title: { key: 'recentChange', params: { n: total } },
        evidence: { kind: 'recent', total, files: pathTimes(data.files) },
      }
    }
    case 'url.tls':
      return { ...common, title: tlsTitle(item), evidence: { kind: 'tls', item } }
    case 'url.http':
      return {
        ...common,
        title: {
          key: levelOf(item) === 'warn' ? 'httpSlow' : 'httpDown',
          params: { host: hostOfUrl(item.key.target) },
        },
        evidence: {
          kind: 'http',
          url: item.key.target,
          status: num(data.status) ?? null,
          ms: valueOf(item) ?? null,
          why: str(data.error) ?? null,
        },
      }
    default:
      return null
  }
}

const COUNTED: readonly string[] = [
  'sec.upload_php',
  'sec.tmp_exec',
  'sec.miner',
  'sec.preload',
  'sec.ports',
  'sec.recent_change',
]

/** A result that is a finding: it has a level to show and, for a counted check, something counted. */
function isFinding(item: Item): boolean {
  if (levelOf(item) === null) return false
  return COUNTED.includes(item.key.check) ? (valueOf(item) ?? 1) > 0 : true
}

/** Every finding of the project, critical first, then by check. */
export function securityFindings(items: readonly Item[], ctx: FindingContext): Finding[] {
  const found = items.filter((i) => isSecurityCheck(i.key.check) && isFinding(i))
  const out: Finding[] = [
    ...filesFindings(
      'sec.upload_php',
      found.filter((i) => i.key.check === 'sec.upload_php'),
      ctx,
    ),
    ...filesFindings(
      'sec.tmp_exec',
      found.filter((i) => i.key.check === 'sec.tmp_exec'),
      ctx,
    ),
    ...found.filter((i) => i.key.check === 'url.exposed').map((i) => exposedFinding(i, ctx)),
    ...found.filter((i) => i.key.check === 'sec.miner').map((i) => minerFinding(i, ctx)),
    ...found.flatMap((i) => {
      const f = singleFinding(i, ctx)
      return f ? [f] : []
    }),
  ]
  return out.sort(
    (a, b) =>
      LEVEL_RANK[a.level] - LEVEL_RANK[b.level] ||
      CHECK_ORDER.indexOf(a.check) - CHECK_ORDER.indexOf(b.check),
  )
}

/** Findings that are open and critical: they become cards. */
export function criticalFindings(findings: readonly Finding[]): Finding[] {
  return findings.filter((f) => f.level === 'crit' && f.standing !== 'expected')
}

/** The rest, one line each: warnings, info and anything expected. */
export function foldedFindings(findings: readonly Finding[]): Finding[] {
  return findings.filter((f) => !(f.level === 'crit' && f.standing !== 'expected'))
}

/** The rule behind an expected finding. */
export function ruleOf(rules: readonly ExpectedRule[], id: string | null): ExpectedRule | null {
  return id === null ? null : (rules.find((r) => r.id === id) ?? null)
}

/**
 * The slice of a files finding that is listed against what the check found: "Showing 50 of
 * 137". `null` when the list is whole.
 */
export function cutList(evidence: Evidence): { listed: number; total: number } | null {
  if (evidence.kind !== 'files') return null
  const listed = evidence.files.length
  return evidence.total > listed ? { listed, total: evidence.total } : null
}
