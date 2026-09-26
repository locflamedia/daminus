// The one event channel from Rust. Payloads are tagged by `kind` and carry
// `scan_id` + `seq` so listeners can drop stale or repeated events.
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { ScanEvent } from './bindings/ScanEvent'

export const SCAN_EVENT = 'scan://event'

export function onScanEvent(handler: (event: ScanEvent) => void): Promise<UnlistenFn> {
  return listen<ScanEvent>(SCAN_EVENT, (e) => handler(e.payload))
}
