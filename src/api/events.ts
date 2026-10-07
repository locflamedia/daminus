// The one event channel from Rust. Payloads are tagged by `kind` and carry
// `scan_id` + `seq` so listeners can drop stale or repeated events.
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { ScanEvent } from './bindings/ScanEvent'
import type { SetupEvent } from './bindings/SetupEvent'

export const SCAN_EVENT = 'scan://event'

export function onScanEvent(handler: (event: ScanEvent) => void): Promise<UnlistenFn> {
  return listen<ScanEvent>(SCAN_EVENT, (e) => handler(e.payload))
}

export const SETUP_EVENT = 'setup://event'

/** Events of the login test and discover; same shape rules as the scan's (`setup_id` + `seq`). */
export function onSetupEvent(handler: (event: SetupEvent) => void): Promise<UnlistenFn> {
  return listen<SetupEvent>(SETUP_EVENT, (e) => handler(e.payload))
}
