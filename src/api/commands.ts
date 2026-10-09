// Typed wrappers over the Rust IPC commands (src-tauri/src/commands.rs).
// The only module that calls `invoke`. A test compares COMMANDS with the
// `generate_handler!` list, the build.rs permission list and the capability.
import { invoke } from '@tauri-apps/api/core'
import type { AgentStatus } from './bindings/AgentStatus'
import type { AiProvidersView } from './bindings/AiProvidersView'
import type { AiSettings } from './bindings/AiSettings'
import type { AiTestResult } from './bindings/AiTestResult'
import type { AppError } from './bindings/AppError'
import type { DataSettings } from './bindings/DataSettings'
import type { DataUsage } from './bindings/DataUsage'
import type { Diagnostics } from './bindings/Diagnostics'
import type { ExportedFile } from './bindings/ExportedFile'
import type { AppearanceSettings } from './bindings/AppearanceSettings'
import type { LaunchInfo } from './bindings/LaunchInfo'
import type { StreakInfo } from './bindings/StreakInfo'
import type { ExpectedDraft } from './bindings/ExpectedDraft'
import type { ExpectedRule } from './bindings/ExpectedRule'
import type { GeneralSettings } from './bindings/GeneralSettings'
import type { HistoryView } from './bindings/HistoryView'
import type { HostAlias } from './bindings/HostAlias'
import type { HostKeyInfo } from './bindings/HostKeyInfo'
import type { HostListing } from './bindings/HostListing'
import type { ModelList } from './bindings/ModelList'
import type { PayloadPreview } from './bindings/PayloadPreview'
import type { PreviewOptions } from './bindings/PreviewOptions'
import type { PreviewScope } from './bindings/PreviewScope'
import type { Project } from './bindings/Project'
import type { ProjectIssue } from './bindings/ProjectIssue'
import type { Report } from './bindings/Report'
import type { ScanFact } from './bindings/ScanFact'
import type { ScanRun } from './bindings/ScanRun'
import type { ScanScope } from './bindings/ScanScope'
import type { SaveOutcome } from './bindings/SaveOutcome'
import type { ScanStarted } from './bindings/ScanStarted'
import type { ScanSettings } from './bindings/ScanSettings'
import type { Settings } from './bindings/Settings'
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
  'rules_add',
  'rules_remove',
  'host_key_check',
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
  'app_launch',
  'streak_get',
  'settings_get',
  'settings_set_general',
  'settings_set_appearance',
  'settings_set_scan',
  'settings_set_data',
  'settings_reset',
  'data_usage',
  'data_export',
  'data_clear',
  'hosts_excluded',
  'hosts_set_include',
  'agent_status',
  'diagnostics_collect',
  'ai_providers',
  'ai_set_key',
  'ai_settings_set',
  'ai_models',
  'ai_test',
  'ai_payload_preview',
  'ai_analyze',
  'ai_cancel',
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

/**
 * Saves a "mark as expected" rule for a result of the latest report. Rust adds the evidence
 * fingerprint, the review day and the id; it refuses what the board forbids.
 */
export function rulesAdd(draft: ExpectedDraft): Promise<ExpectedRule> {
  return invoke<ExpectedRule>('rules_add', { draft })
}

/** Takes an expected rule out again (Undo). `false` when it was not there. */
export function rulesRemove(id: string): Promise<boolean> {
  return invoke<boolean>('rules_remove', { id })
}

/**
 * The key `host` offers and the keys recorded for it, read without logging in. `null` when ssh
 * cannot say what the connection to the host uses.
 */
export function hostKeyCheck(host: HostAlias): Promise<HostKeyInfo | null> {
  return invoke<HostKeyInfo | null>('host_key_check', { host })
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

/** Whether an SSH agent answers, and how many keys it holds (a count only). */
export function agentStatus(): Promise<AgentStatus> {
  return invoke<AgentStatus>('agent_status')
}

/** The redacted diagnostics text to copy for a bug report; nothing is sent anywhere. */
export function diagnosticsCollect(): Promise<Diagnostics> {
  return invoke<Diagnostics>('diagnostics_collect')
}

/** Which intro journey to play; records this launch, so each call counts as one opening. */
export function appLaunch(): Promise<LaunchInfo> {
  return invoke<LaunchInfo>('app_launch')
}

/** Clear weeks in a row, counted on this Mac only. */
export function streakGet(): Promise<StreakInfo> {
  return invoke<StreakInfo>('streak_get')
}

/** `settings.json` as saved; what the file leaves out has its default. */
export function settingsGet(): Promise<Settings> {
  return invoke<Settings>('settings_get')
}

/** Replaces Settings › General. The whole file is checked again; answers with what was saved. */
export function settingsSetGeneral(general: GeneralSettings): Promise<Settings> {
  return invoke<Settings>('settings_set_general', { general })
}

/** Replaces Settings › Appearance; checked and answered like `settingsSetGeneral`. */
export function settingsSetAppearance(appearance: AppearanceSettings): Promise<Settings> {
  return invoke<Settings>('settings_set_appearance', { appearance })
}

/**
 * Replaces Settings › Scan (what to check, the limits, the thresholds); checked and answered like
 * `settingsSetGeneral`. Thresholds apply to the next report, no new scan is needed.
 */
export function settingsSetScan(scan: ScanSettings): Promise<Settings> {
  return invoke<Settings>('settings_set_scan', { scan })
}

/** Replaces Settings › Data (scans kept, AI replies forgotten); checked like `settingsSetGeneral`. */
export function settingsSetData(data: DataSettings): Promise<Settings> {
  return invoke<Settings>('settings_set_data', { data })
}

/** Puts every setting back to its default; answers with what was saved. */
export function settingsReset(): Promise<Settings> {
  return invoke<Settings>('settings_reset')
}

/** What the app's folder holds: path, files, bytes by kind and the size of each scan. */
export function dataUsage(): Promise<DataUsage> {
  return invoke<DataUsage>('data_usage')
}

/** Writes every kept scan, redacted, to a new file in Downloads; answers with the file's name. */
export function dataExport(): Promise<ExportedFile> {
  return invoke<ExportedFile>('data_export')
}

/** Deletes the scans and the expected notes from this Mac; answers how many scans went. */
export function dataClear(): Promise<number> {
  return invoke<number>('data_clear')
}

/** The hosts switched off for scans in Settings › Hosts. */
export function hostsExcluded(): Promise<HostAlias[]> {
  return invoke<HostAlias[]>('hosts_excluded')
}

/** Switches one host on or off for scans; answers with the hosts that are off afterwards. */
export function hostsSetInclude(host: HostAlias, include: boolean): Promise<HostAlias[]> {
  return invoke<HostAlias[]>('hosts_set_include', { host, include })
}

/**
 * The eight providers with whether a key is stored for each (never the key), the selection, the
 * Claude Code consent and what the `claude` program reports. No `claude` is `found: false`.
 */
export function aiProviders(): Promise<AiProvidersView> {
  return invoke<AiProvidersView>('ai_providers')
}

/**
 * Stores the key of a provider in the Keychain, or removes it with `null`. Answers whether a key
 * is stored afterwards. This is the only call that carries a key, and only inward.
 */
export function aiSetKey(providerId: string, key: string | null): Promise<boolean> {
  return invoke<boolean>('ai_set_key', { providerId, key })
}

/**
 * Replaces Settings › AI (provider, model, endpoint, Claude Code consent). Rust checks the
 * provider and the URL, then the whole file; answers with what was saved.
 */
export function aiSettingsSet(ai: AiSettings): Promise<Settings> {
  return invoke<Settings>('ai_settings_set', { ai })
}

/** The models a provider offers, or its suggestions with `manual_entry` when it cannot list. */
export function aiModels(providerId: string): Promise<ModelList> {
  return invoke<ModelList>('ai_models', { providerId })
}

/** Checks a provider with its stored key. A failure is in the answer, not a rejection. */
export function aiTest(providerId: string): Promise<AiTestResult> {
  return invoke<AiTestResult>('ai_test', { providerId })
}

/**
 * The text that would be sent for `scope`, from the latest report. `ai_analyze` sends exactly
 * these bytes, named by the `hash`.
 */
export function aiPayloadPreview(
  scope: PreviewScope,
  options: PreviewOptions,
): Promise<PayloadPreview> {
  return invoke<PayloadPreview>('ai_payload_preview', { scope, options })
}

/**
 * Sends the previewed payload. Resolves once the send is under way; the reply comes on
 * `ai://event` (`onAiEvent`), tagged with `requestId`. Rejects when nothing was sent.
 */
export function aiAnalyze(requestId: string, previewedHash: string): Promise<void> {
  return invoke<void>('ai_analyze', { requestId, previewedHash })
}

/** Stops a send; it ends with a `cancelled` event. `false` when `requestId` is not running. */
export function aiCancel(requestId: string): Promise<boolean> {
  return invoke<boolean>('ai_cancel', { requestId })
}
