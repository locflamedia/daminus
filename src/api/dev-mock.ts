// Development only: answers the IPC commands with a fixed report so the window can be seen in
// a plain browser (`?mock` in the address). The production bundle never imports it.
import { ResultsMock, isResultsVariant } from './dev-mock-results'
import { SetupMock, isSetupVariant } from './dev-mock-setup'
import type { ResultsBundle } from '@/testing/results-bundle'
import { mockCommands } from './testing'

/**
 * The result screens read the twelve-scan timeline (`dev-mock-results.ts` lists the variants:
 * the default `results`, `stale`, `scanning`, `scan-live`, `loading`, `error`, `first-scan`,
 * `groups-off`, `states`). The setup screens: `?mock=empty` (nothing saved yet, the board's servers),
 * `empty-noconfig` and `empty-nousable` (the two reasons there is no host), `setup` (the whole
 * flow against scripted servers; add `&speed=4` to run it faster) and `setup-saved` (the same
 * with a project already saved, so the second run meets "Already saved"). Failure screens:
 * `setup-failures` (every way a login test ends badly), `setup-empty-discover` (discover finds
 * nothing on any host) and `setup-queued` (one host starts six seconds late).
 */
export async function installDevMock(variant = '', speed = 1): Promise<void> {
  if (isSetupVariant(variant)) {
    const setup = new SetupMock(variant, speed)
    mockCommands((cmd, args) => {
      const answered = setup.handle(cmd, args)
      if (answered !== undefined) return answered
      if (cmd === 'report_latest') return emptyReport()
      if (cmd === 'scan_status') return null
      if (cmd === 'history_list') return { scans: [], keep: 20, bytes: 0 }
      if (cmd === 'history_facts' || cmd === 'rules_list') return []
      return null
    })
    return
  }
  const bundle = (await import('@/testing/fixtures/results.json'))
    .default as unknown as ResultsBundle
  const results = new ResultsMock(isResultsVariant(variant) ? variant : 'results', bundle, speed)
  mockCommands((cmd, args) => results.handle(cmd, args) ?? null)
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
