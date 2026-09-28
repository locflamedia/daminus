// Test-only IPC doubles, kept here so tests elsewhere never import Tauri.
// Not imported by app code.
import { emit } from '@tauri-apps/api/event'
import { clearMocks, mockIPC } from '@tauri-apps/api/mocks'
import type { ScanEvent } from './bindings/ScanEvent'
import type { CommandName } from './commands'
import { SCAN_EVENT } from './events'

export type CommandMock = (cmd: CommandName, args: Record<string, unknown>) => unknown

/** Answers commands with `handler`; `scan://event` listeners get `emitScanEvent`. */
export function mockCommands(handler: CommandMock): void {
  mockIPC((cmd, args) => handler(cmd as CommandName, (args ?? {}) as Record<string, unknown>), {
    shouldMockEvents: true,
  })
}

/** Delivers `event` as Rust would. */
export function emitScanEvent(event: ScanEvent): Promise<void> {
  return emit(SCAN_EVENT, event)
}

export { clearMocks }
