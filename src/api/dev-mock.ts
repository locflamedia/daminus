// Development only: answers the IPC commands with a fixed report so the window can be seen in
// a plain browser (`?mock` in the address). The production bundle never imports it.
import { shellProjects, shellReport, shellScanRun } from '@/testing/shell-fixture'
import { mockCommands } from './testing'

/** `?mock=scanning` shows the window in the middle of a scan, `?mock=stale` with results four days old. */
export function installDevMock(variant = ''): void {
  mockCommands((cmd) => {
    if (cmd === 'report_latest')
      return shellReport(variant === 'stale' ? (4 * 24 + 1) * 3_600_000 : undefined)
    if (cmd === 'projects_list') return shellProjects()
    if (cmd === 'scan_status' && variant === 'scanning') return shellScanRun()
    return null
  })
}
