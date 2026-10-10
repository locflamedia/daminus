// The one event channel from Rust. Payloads are tagged by `kind` and carry
// `scan_id` + `seq` so listeners can drop stale or repeated events.
import { isTauri } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { AiStreamEvent } from './bindings/AiStreamEvent'
import type { AppError } from './bindings/AppError'
import type { ScanEvent } from './bindings/ScanEvent'
import type { SetupEvent } from './bindings/SetupEvent'

export const SCAN_EVENT = 'scan://event'

export function onScanEvent(handler: (event: ScanEvent) => void): Promise<UnlistenFn> {
  return listen<ScanEvent>(SCAN_EVENT, (e) => handler(e.payload))
}

export const SCAN_REFUSED_EVENT = 'scan://refused'

/**
 * A scan the menu bar asked for did not start (ssh refuses the ssh config): the error, so the
 * window says what the menu says.
 */
export function onScanRefused(handler: (error: AppError) => void): Promise<UnlistenFn> {
  return listen<AppError>(SCAN_REFUSED_EVENT, (e) => handler(e.payload))
}

export const SETUP_EVENT = 'setup://event'

/** Events of the login test and discover; same shape rules as the scan's (`setup_id` + `seq`). */
export function onSetupEvent(handler: (event: SetupEvent) => void): Promise<UnlistenFn> {
  return listen<SetupEvent>(SETUP_EVENT, (e) => handler(e.payload))
}

export const AI_EVENT = 'ai://event'

/**
 * The events of an AI send: `summary_delta` (append), `finding`, then `done` (carries the whole
 * summary), or `error`, or `cancelled`. Tagged with `request_id` and a rising `seq`; the text is
 * already shown with the user's own names.
 */
export function onAiEvent(handler: (event: AiStreamEvent) => void): Promise<UnlistenFn> {
  return listen<AiStreamEvent>(AI_EVENT, (e) => handler(e.payload))
}

export const TRAY_OPEN_PROJECT_EVENT = 'tray://open-project'

export interface TrayOpenProject {
  project_id: string
}

/**
 * "Open <project>" in the menu bar menu. Outside a Tauri window (a plain browser, the mock) there
 * is no tray: nothing is listened to and the returned function does nothing.
 */
export async function onTrayOpenProject(
  handler: (event: TrayOpenProject) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) return () => {}
  return listen<TrayOpenProject>(TRAY_OPEN_PROJECT_EVENT, (e) => handler(e.payload))
}
