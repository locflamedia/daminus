// The hand-written wrappers must name exactly the commands Rust registers,
// grants permissions for, and the main window's capability allows.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { COMMANDS } from './commands'

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
const sorted = (names: Iterable<string>) => [...names].sort()

describe('IPC command list', () => {
  it('matches generate_handler! in src-tauri/src/lib.rs', () => {
    const lib = read('../../src-tauri/src/lib.rs')
    const list = /generate_handler!\[([^\]]*)\]/.exec(lib)?.[1] ?? ''
    const names = [...list.matchAll(/commands::(\w+)/g)].map((m) => m[1] ?? '')
    expect(sorted(names)).toEqual(sorted(COMMANDS))
  })

  it('matches the permission list in src-tauri/build.rs', () => {
    const build = read('../../src-tauri/build.rs')
    const list = /COMMANDS: &\[&str\] = &\[([^\]]*)\]/.exec(build)?.[1] ?? ''
    const names = [...list.matchAll(/"(\w+)"/g)].map((m) => m[1] ?? '')
    expect(sorted(names)).toEqual(sorted(COMMANDS))
  })

  it('is exactly what the main capability grants', () => {
    const cap = JSON.parse(read('../../src-tauri/capabilities/main.json')) as {
      permissions: (string | { identifier: string })[]
    }
    const ids = cap.permissions.map((p) => (typeof p === 'string' ? p : p.identifier))
    const own = ids.filter((id) => !id.includes(':'))
    expect(sorted(own)).toEqual(sorted(COMMANDS.map((c) => `allow-${c.replaceAll('_', '-')}`)))
    // The overlay title bar: dragging by the strip, zoom on a double click, full-screen state.
    expect(ids.filter((id) => id.startsWith('core:window:'))).toEqual([
      'core:window:allow-start-dragging',
      'core:window:allow-internal-toggle-maximize',
      'core:window:allow-is-fullscreen',
    ])
    // No shell, file system or HTTP plugin; opener only for https; clipboard write only.
    expect(ids.some((id) => /^(shell|fs|http):/.test(id))).toBe(false)
    expect(ids.filter((id) => id.startsWith('clipboard-manager:'))).toEqual([
      'clipboard-manager:allow-write-text',
    ])
    const opener = cap.permissions.filter((p) =>
      (typeof p === 'string' ? p : p.identifier).startsWith('opener:'),
    )
    expect(opener).toEqual([{ identifier: 'opener:allow-open-url', allow: [{ url: 'https://*' }] }])
  })
})
