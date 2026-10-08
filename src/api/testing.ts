// Test-only IPC doubles, kept here so tests elsewhere never import Tauri.
// Not imported by app code.
import { emit } from '@tauri-apps/api/event'
import { clearMocks, mockIPC } from '@tauri-apps/api/mocks'
import type { AiStreamEvent } from './bindings/AiStreamEvent'
import type { ScanEvent } from './bindings/ScanEvent'
import type { SetupEvent } from './bindings/SetupEvent'
import type { CommandName } from './commands'
import { AI_EVENT, SCAN_EVENT, SETUP_EVENT } from './events'

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

/** Delivers a setup `event` as Rust would. */
export function emitSetupEvent(event: SetupEvent): Promise<void> {
  return emit(SETUP_EVENT, event)
}

/** Delivers an AI send `event` as Rust would. */
export function emitAiEvent(event: AiStreamEvent): Promise<void> {
  return emit(AI_EVENT, event)
}

export { clearMocks }
