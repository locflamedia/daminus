// Typed wrappers over the Rust IPC commands (src-tauri/src/commands.rs).
// The only module that calls `invoke`. A test compares COMMANDS with the
// `generate_handler!` list, the build.rs permission list and the capability.
import { invoke } from '@tauri-apps/api/core'
import type { AppError } from './bindings/AppError'
import type { Project } from './bindings/Project'
import type { Report } from './bindings/Report'
import type { ScanRun } from './bindings/ScanRun'
import type { ScanScope } from './bindings/ScanScope'
import type { ScanStarted } from './bindings/ScanStarted'

export const COMMANDS = [
  'scan_start',
  'scan_stop',
  'scan_status',
  'report_latest',
  'projects_list',
  'reveal_config_dir',
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

/** The saved projects: name, colour, URLs and components. */
export function projectsList(): Promise<Project[]> {
  return invoke<Project[]>('projects_list')
}

/** Shows the config folder in Finder. */
export function revealConfigDir(): Promise<void> {
  return invoke<void>('reveal_config_dir')
}
