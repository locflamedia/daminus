// Development only: answers the IPC commands with a fixed report so the window can be seen in
// a plain browser (`?mock` in the address). The production bundle never imports it.
import { AiMock } from './dev-mock-ai'
import { diagnosticsAnswer } from './dev-mock-diagnostics'
import { withExpectedAndHostKey } from './dev-mock-expected'
import { ResultsMock, isResultsVariant } from './dev-mock-results'
import { settingsAnswer } from './dev-mock-settings'
import { SetupMock, isSetupVariant } from './dev-mock-setup'
import type { ResultsBundle } from '@/testing/results-bundle'
import { mockCommands } from './testing'

/** What the scripted setup servers answer inside the result screens. */
const HOST_COMMANDS = /^(hosts_list|ssh_environment|setup_)/

/**
 * The result screens read the twelve-scan timeline (`dev-mock-results.ts` lists the variants:
 * the default `results`, `stale`, `scanning`, `scan-live`, `loading`, `error`, `first-scan`,
 * `groups-off`, `states`). The setup screens: `?mock=empty` (nothing saved yet, the board's servers),
 * `empty-noconfig` and `empty-nousable` (the two reasons there is no host), `empty-noagent` (hosts
 * but no ssh-agent running), `setup` (the whole
 * flow against scripted servers; add `&speed=4` to run it faster) and `setup-saved` (the same
 * with a project already saved, so the second run meets "Already saved"). Failure screens:
 * `setup-failures` (every way a login test ends badly), `setup-empty-discover` (discover finds
 * nothing on any host) and `setup-queued` (one host starts six seconds late). The AI screens:
 * `?mock=ai` and the variants listed in `dev-mock-ai.ts` (Claude Code states, refused and
 * broken sends, a refusing Keychain); the send is scripted: summary pieces, three findings, done.
 */
/** The intro journey of `?intro=first|returning|daily`; daily by default. */
function launchAnswer() {
  const asked = new URLSearchParams(location.search).get('intro')
  const kind = asked === 'first' || asked === 'returning' ? asked : 'daily'
  return { kind, previous: null }
}

export async function installDevMock(variant = '', speed = 1): Promise<void> {
  // The window opens as for a person who finished the AI step of Settings: a provider with its
  // key and a model, so a question can be sent. (Tests start from the plain defaults.)
  settingsAnswer('ai_settings_set', {
    ai: {
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      claude_code_acknowledged: false,
      base_url: null,
    },
  })
  if (isSetupVariant(variant)) {
    const setup = new SetupMock(variant, speed)
    const ai = new AiMock(variant, speed)
    mockCommands((cmd, args) => {
      if (cmd === 'app_launch') return launchAnswer()
      if (cmd === 'streak_get') return { weeks: 6 }
      const answered = setup.handle(cmd, args)
      if (answered !== undefined) return answered
      const aiAnswer = ai.handle(cmd, args)
      if (aiAnswer !== undefined) return aiAnswer
      const diagnostics = diagnosticsAnswer(cmd)
      if (diagnostics !== undefined) return diagnostics
      const settings = settingsAnswer(cmd, args)
      if (settings !== undefined) return settings
      if (cmd === 'report_latest') return emptyReport()
      if (cmd === 'scan_status') return null
      if (cmd === 'history_list') return { scans: [], keep: 20, bytes: 0 }
      if (cmd === 'history_facts' || cmd === 'rules_list') return []
      return null
    })
    return
  }
  const bundle = await loadBundle(variant)
  const results = new ResultsMock(isResultsVariant(variant) ? variant : 'results', bundle, speed)
  // The hosts and the login tests of the Settings screens come from the scripted setup servers,
  // which carry the same aliases as the timeline.
  const hosts = new SetupMock('setup', speed)
  const ai = new AiMock(variant, speed)
  mockCommands(
    withExpectedAndHostKey(
      (cmd, args) =>
        (cmd === 'app_launch' ? launchAnswer() : undefined) ??
        (cmd === 'streak_get' ? { weeks: 6 } : undefined) ??
        results.handle(cmd, args) ??
        ai.handle(cmd, args) ??
        diagnosticsAnswer(cmd) ??
        settingsAnswer(cmd, args) ??
        (HOST_COMMANDS.test(cmd) ? hosts.handle(cmd, args) : undefined) ??
        null,
      variant,
    ),
  )
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

/**
 * The timeline of the repository, or with `?mock=real` the scans of a fake server: a config
 * folder made by `scripts/fake-server/real-data.sh` and exported as `local-real/bundle.json`
 * (git-ignored), so the screens can be read against output the real checks produced.
 */
async function loadBundle(variant: string): Promise<ResultsBundle> {
  if (variant === 'real') {
    const res = await fetch('/local-real/bundle.json')
    if (!res.ok)
      throw new Error('local-real/bundle.json is missing: run scripts/fake-server/real-data.sh')
    return (await res.json()) as ResultsBundle
  }
  return (await import('@/testing/fixtures/results.json')).default as unknown as ResultsBundle
}
