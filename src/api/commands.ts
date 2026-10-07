// Typed wrappers over the Rust IPC commands (src-tauri/src/commands.rs).
// The only module that calls `invoke`. A test compares COMMANDS with the
// `generate_handler!` list, the build.rs permission list and the capability.
import { invoke } from '@tauri-apps/api/core'
import type { AppError } from './bindings/AppError'
import type { ExpectedRule } from './bindings/ExpectedRule'
import type { HistoryView } from './bindings/HistoryView'
import type { HostAlias } from './bindings/HostAlias'
import type { HostListing } from './bindings/HostListing'
import type { Project } from './bindings/Project'
import type { ProjectIssue } from './bindings/ProjectIssue'
import type { Report } from './bindings/Report'
import type { ScanFact } from './bindings/ScanFact'
import type { ScanRun } from './bindings/ScanRun'
import type { ScanScope } from './bindings/ScanScope'
import type { SaveOutcome } from './bindings/SaveOutcome'
import type { ScanStarted } from './bindings/ScanStarted'
import type { SetupResult } from './bindings/SetupResult'
import type { SetupRun } from './bindings/SetupRun'
import type { SetupStarted } from './bindings/SetupStarted'
import type { SetupStep } from './bindings/SetupStep'
import type { SshEnvironment } from './bindings/SshEnvironment'
import type { UrlCheck } from './bindings/UrlCheck'

export const COMMANDS = [
  'scan_start',
  'scan_stop',
  'scan_status',
  'report_latest',
  'history_list',
  'report_at',
  'history_facts',
  'rules_list',
  'projects_list',
  'reveal_config_dir',
  'reveal_ssh_dir',
  'hosts_list',
  'ssh_environment',
  'setup_start',
  'setup_stop',
  'setup_status',
  'setup_result',
  'projects_validate',
  'projects_save',
  'projects_remove',
  'url_check',
] as const

export type CommandName = (typeof COMMANDS)[number]

/** A rejected command carries an `AppError` (code + params), never display text. */
export function isAppError(e: unknown): e is AppError {
  return typeof e === 'object' && e !== null && 'code' in e && 'retryable' in e
}

/** Starts a scan, or joins the one already running (menu bar and window share it). */
export function scanStart(scope?: ScanScope): Promise<ScanStarted> {
  return invoke<ScanStarted>('scan_start', { scope: scope ?? null })
}

/** Stops the running scan; nothing is saved. `false` when none was running. */
export function scanStop(): Promise<boolean> {
  return invoke<boolean>('scan_stop')
}

/** The scan in progress, or `null`. */
export function scanStatus(): Promise<ScanRun | null> {
  return invoke<ScanRun | null>('scan_status')
}

/** `evaluate` over the saved scans. */
export function reportLatest(): Promise<Report> {
  return invoke<Report>('report_latest')
}

/** One summary per kept scan (counts, hosts, per-project levels), oldest first. */
export function historyList(): Promise<HistoryView> {
  return invoke<HistoryView>('history_list')
}

/** `evaluate` over the saved scans up to scan `seq`, as of when it finished. */
export function reportAt(seq: number): Promise<Report> {
  return invoke<Report>('report_at', { seq })
}

/** The raw facts of `checks` in the newest `last` scans, oldest scan first. */
export function historyFacts(checks: string[], last: number): Promise<ScanFact[]> {
  return invoke<ScanFact[]>('history_facts', { checks, last })
}

/** The expected rules: what each covers, why, and until which day. */
export function rulesList(): Promise<ExpectedRule[]> {
  return invoke<ExpectedRule[]>('rules_list')
}

/** The saved projects: name, colour, URLs and components. */
export function projectsList(): Promise<Project[]> {
  return invoke<Project[]>('projects_list')
}

/** Shows the config folder in Finder. */
export function revealConfigDir(): Promise<void> {
  return invoke<void>('reveal_config_dir')
}

/** Shows `~/.ssh` in Finder; rejects with an `io` error when the folder does not exist. */
export function revealSshDir(): Promise<void> {
  return invoke<void>('reveal_ssh_dir')
}

/** The hosts of `~/.ssh/config` with what ssh resolves for each, and the entries left out. */
export function hostsList(): Promise<HostListing> {
  return invoke<HostListing>('hosts_list')
}

/** Whether the SSH agent holds keys and Termius is installed. */
export function sshEnvironment(): Promise<SshEnvironment> {
  return invoke<SshEnvironment>('ssh_environment')
}

/** Starts the login test or discover on `hosts`, or joins the run in progress. */
export function setupStart(
  step: SetupStep,
  hosts: HostAlias[],
  paths: string[] = [],
): Promise<SetupStarted> {
  return invoke<SetupStarted>('setup_start', { step, hosts, paths })
}

/** Stops the running setup step. `false` when none was running. */
export function setupStop(): Promise<boolean> {
  return invoke<boolean>('setup_stop')
}

/** The setup step in progress, or `null`. */
export function setupStatus(): Promise<SetupRun | null> {
  return invoke<SetupRun | null>('setup_status')
}

/** What the setup steps found so far, and the suggested projects. */
export function setupResult(): Promise<SetupResult> {
  return invoke<SetupResult>('setup_result')
}

/** What is wrong or doubtful about `projects`, per field. */
export function projectsValidate(projects: Project[]): Promise<ProjectIssue[]> {
  return invoke<ProjectIssue[]>('projects_validate', { projects })
}

/** Checks the whole set again and writes `projects.json`; errors write nothing. */
export function projectsSave(projects: Project[], hosts: HostAlias[] = []): Promise<SaveOutcome> {
  return invoke<SaveOutcome>('projects_save', { projects, hosts })
}

/** Takes a project out of `projects.json`. `false` when it was not there. */
export function projectsRemove(id: string): Promise<boolean> {
  return invoke<boolean>('projects_remove', { id })
}

/** One URL as a scan would see it: status, time, days left on the certificate. */
export function urlCheck(url: string): Promise<UrlCheck> {
  return invoke<UrlCheck>('url_check', { url })
}
