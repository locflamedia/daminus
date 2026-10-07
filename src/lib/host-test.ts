// What the login test of a host says, as the pick-hosts screen shows it: one chip out of ten,
// the line about the system, and the permission rows with the one command that fixes each.
// Pure functions over the generated types; words come from the screen's messages.
import type { DockerAccess, HostOutcome, LoginReport, LoginResult, PathState } from '@/api'

/** The ten chips of "Login test, every state". */
export type TestChip =
  | 'queued'
  | 'connecting'
  | 'agent_wait'
  | 'testing'
  | 'reached'
  | 'host_key_unknown'
  | 'host_key_changed'
  | 'key_rejected'
  | 'unreachable'
  | 'timed_out'

/** How far a host is in its test: what the run says live, then how it ended. */
export type TestProgress =
  | { state: 'queued' | 'connecting' | 'agent_wait' | 'running' }
  | { state: 'finished'; outcome: HostOutcome }

export function chipOf(progress: TestProgress | null, login: LoginResult | null): TestChip {
  if (progress === null) return login?.login ? 'reached' : 'queued'
  switch (progress.state) {
    case 'queued':
    case 'connecting':
    case 'agent_wait':
      return progress.state
    case 'running':
      return 'testing'
    case 'finished':
      return chipOfOutcome(progress.outcome, login)
  }
}

export function chipOfOutcome(outcome: HostOutcome, login: LoginResult | null): TestChip {
  switch (outcome.state) {
    case 'reached':
      return 'reached'
    case 'partial':
      // It answered but stopped before saying everything: what it said is enough when it
      // identified itself, otherwise it is as good as unreachable.
      return login?.login ? 'reached' : 'unreachable'
    case 'unreachable':
      return 'unreachable'
    case 'auth_failed':
      return 'key_rejected'
    case 'host_key_unknown':
      return 'host_key_unknown'
    case 'host_key_changed':
      return 'host_key_changed'
    case 'timeout':
      return 'timed_out'
  }
}

/** The host answered the login test: it is usable, with or without missing permissions. */
export function isReady(chip: TestChip): boolean {
  return chip === 'reached'
}

/** The test ended without a usable answer. */
export function isFailed(chip: TestChip): boolean {
  return (
    chip === 'host_key_unknown' ||
    chip === 'host_key_changed' ||
    chip === 'key_rejected' ||
    chip === 'unreachable' ||
    chip === 'timed_out'
  )
}

export function isRunning(chip: TestChip): boolean {
  return chip === 'connecting' || chip === 'agent_wait' || chip === 'testing'
}

/** Bars of the latency signal: three under a second, two above. */
export function latencyBars(ms: number): 2 | 3 {
  return ms < 1000 ? 3 : 2
}

/** The last path part of the first identity file (`~/.ssh/id_ed25519` becomes `id_ed25519`). */
export function keyName(identityFiles: readonly string[]): string | null {
  const first = identityFiles[0]
  if (!first) return null
  return first.split('/').filter(Boolean).pop() ?? null
}

/** Distributions past their security updates. */
const EOL = [
  // As of 2026-10: Ubuntu 20.04 left standard support in 2025-05, Debian 11 LTS ended 2026-08.
  { name: 'ubuntu', below: 22 },
  { name: 'debian', below: 12 },
] as const

/** `Ubuntu 22.04.3 LTS` becomes `Ubuntu 22.04`, `Debian GNU/Linux 12 (bookworm)` `Debian 12`. */
export function shortDistro(prettyName: string): string {
  const name = prettyName.trim()
  const ubuntu = /^Ubuntu\s+(\d+\.\d+)/i.exec(name)
  if (ubuntu) return `Ubuntu ${ubuntu[1]}`
  const debian = /^Debian(?:\s+GNU\/Linux)?\s+(\d+)/i.exec(name)
  if (debian) return `Debian ${debian[1]}`
  return name.replace(/\s*\(.*\)\s*$/, '').replace(/\s+LTS$/i, '')
}

/** Whether the system no longer gets security updates (the "EOL" tag). */
export function isEndOfLife(prettyName: string): boolean {
  const match = /^(Ubuntu|Debian)(?:\s+GNU\/Linux)?\s+(\d+)/i.exec(prettyName.trim())
  if (!match) return false
  const family = (match[1] ?? '').toLowerCase()
  const major = Number(match[2])
  return EOL.some((e) => e.name === family && major < e.below)
}

// --- permission rows -----------------------------------------------------------------------

/** A user name that is safe to put in a command the user copies; else a placeholder. */
export function safeUser(user: string): string {
  return /^[a-z_][a-z0-9_-]{0,31}$/i.test(user) ? user : '<user>'
}

/** One argument for a shell: plain words stay as they are, anything else is single-quoted. */
export function shellQuote(value: string): string {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`
}

export type PermissionTone = 'ok' | 'warn' | 'crit'

export interface PermissionRow {
  kind: 'docker' | 'logs' | 'folder'
  /** The folder of a folder row. */
  path?: string
  /** The answer, which the screen words (`no_permission`, `denied`…). */
  answer: string
  tone: PermissionTone
  /** The command that fixes it; `null` when nothing the user can paste would. */
  fix: string | null
  /** An amber row with a fix: a permission the host lacks. */
  missing: boolean
}

function dockerRow(report: LoginReport): PermissionRow | null {
  const answers: Record<DockerAccess, { tone: PermissionTone; fix: string | null }> = {
    ok: { tone: 'ok', fix: null },
    no_permission: { tone: 'warn', fix: `sudo usermod -aG docker ${safeUser(report.user)}` },
    stopped: { tone: 'warn', fix: 'sudo systemctl start docker' },
    missing: { tone: 'ok', fix: null },
  }
  // No docker command: nothing to ask of it, so the row is not drawn.
  if (report.docker === 'missing') return null
  const { tone, fix } = answers[report.docker]
  return {
    kind: 'docker',
    answer: report.docker,
    tone,
    fix,
    missing: report.docker === 'no_permission',
  }
}

function logsRow(report: LoginReport): PermissionRow {
  const allowed = report.root || report.adm_group || report.journal_group
  return {
    kind: 'logs',
    answer: allowed ? 'ok' : 'no_permission',
    tone: allowed ? 'ok' : 'warn',
    fix: allowed ? null : `sudo usermod -aG systemd-journal ${safeUser(report.user)}`,
    missing: !allowed,
  }
}

const FOLDER_TONE: Record<PathState, PermissionTone> = {
  readable: 'ok',
  denied: 'warn',
  missing: 'crit',
}

function folderRow(report: LoginReport, path: string, state: PathState): PermissionRow {
  const user = safeUser(report.user)
  return {
    kind: 'folder',
    path,
    answer: state,
    tone: FOLDER_TONE[state],
    fix: state === 'denied' ? `sudo setfacl -R -m u:${user}:rX ${shellQuote(path)}` : null,
    missing: state === 'denied',
  }
}

/** Docker, system logs and each project folder, as the reached host's rows. */
export function permissionRows(login: LoginResult): PermissionRow[] {
  const report = login.login
  if (!report) return []
  const rows: PermissionRow[] = []
  const docker = dockerRow(report)
  if (docker) rows.push(docker)
  rows.push(logsRow(report))
  for (const p of login.paths) rows.push(folderRow(report, p.path, p.state))
  return rows
}

/** How many rows are a missing permission (the host chip says "2 permissions missing"). */
export function missingPermissions(rows: readonly PermissionRow[]): number {
  return rows.filter((r) => r.missing).length
}

/** The `ssh-add` line for a rejected key; `null` when the config names no key file. */
export function addKeyCommand(identityFiles: readonly string[]): string | null {
  const first = identityFiles[0]
  if (!first) return null
  // A leading `~/` must stay outside the quotes for the shell to expand it.
  const path = first.startsWith('~/') ? `~/${shellQuote(first.slice(2))}` : shellQuote(first)
  return `ssh-add ${path}`
}
