// Writing to the clipboard goes through the Tauri plugin; the main window's capability
// grants `clipboard-manager:allow-write-text` and nothing else (no read).
import { writeText } from '@tauri-apps/plugin-clipboard-manager'

/** Puts `text` on the system clipboard. Rejects when the system refuses. */
export function copyText(text: string): Promise<void> {
  return writeText(text)
}
