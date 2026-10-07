// Development only: answers the IPC commands with a fixed report so the window can be seen in
// a plain browser (`?mock` in the address). The production bundle never imports it.
import { shellProjects, shellReport, shellScanRun } from '@/testing/shell-fixture'
import { SetupMock, isSetupVariant } from './dev-mock-setup'
import { mockCommands } from './testing'

/**
 * `?mock=scanning` shows the window in the middle of a scan, `?mock=stale` with results four
 * days old. The setup screens: `?mock=empty` (nothing saved yet, the board's servers),
 * `empty-noconfig` and `empty-nousable` (the two reasons there is no host), `setup` (the whole
 * flow against scripted servers; add `&speed=4` to run it faster) and `setup-saved` (the same
 * with a project already saved, so the second run meets "Already saved"). Failure screens:
 * `setup-failures` (every way a login test ends badly), `setup-empty-discover` (discover finds
 * nothing on any host) and `setup-queued` (one host starts six seconds late).
 */
export function installDevMock(variant = '', speed = 1): void {
  if (isSetupVariant(variant)) {
    const setup = new SetupMock(variant, speed)
    mockCommands((cmd, args) => {
      const answered = setup.handle(cmd, args)
      if (answered !== undefined) return answered
      if (cmd === 'report_latest') return emptyReport()
      if (cmd === 'scan_status') return null
      return null
    })
    return
  }
  mockCommands((cmd) => {
    if (cmd === 'report_latest')
      return shellReport(variant === 'stale' ? (4 * 24 + 1) * 3_600_000 : undefined)
    if (cmd === 'projects_list') return shellProjects()
    if (cmd === 'scan_status' && variant === 'scanning') return shellScanRun()
    return null
  })
}

function emptyReport() {
  const now = new Date().toISOString()
  return {
    evaluated_at: now,
    items: [],
    projects: [],
    servers: [],
    disabled_groups: [],
    rules_due: [],
    counts: { crit: 0, warn: 0, expected: 0, needs_perm: 0, stale: 0, unknown: 0 },
  }
}
