// Development only: answers the IPC commands with a fixed report so the window can be seen in
// a plain browser (`?mock` in the address). The production bundle never imports it.
import { shellProjects, shellReport } from '@/testing/shell-fixture'
import { mockCommands } from './testing'

export function installDevMock(): void {
  mockCommands((cmd) => {
    if (cmd === 'report_latest') return shellReport()
    if (cmd === 'projects_list') return shellProjects()
    return null
  })
}
