// Development only: answers for the agent and diagnostics commands in a plain browser.
import type { AgentStatus } from './bindings/AgentStatus'
import type { Diagnostics } from './bindings/Diagnostics'

const AGENT: AgentStatus = { present: true, has_keys: true, keys: 2 }

const DIAGNOSTICS: Diagnostics = {
  text: [
    'Daminus 0.1.0',
    'OS: macOS 15.6 (aarch64)',
    'ssh: OpenSSH_9.9p2, LibreSSL 3.3.6',
    'PATH: /opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',
    '',
    '## Settings',
    '{',
    '  "version": 1,',
    '  "general": { "language": "en", "scan_on_open": false, "intro": "first_launch" },',
    '  "ai": { "claude_code_acknowledged": false }',
    '}',
    '',
    '## Hosts (last result)',
    'vps-a: reached (2026-09-26T06:42:00Z)',
    'vps-b: auth failed (2026-09-26T06:42:00Z)',
    '',
    '## Log (last 200 lines)',
    '2026-09-26T06:41:58Z INFO daminus_app Daminus starting',
    '2026-09-26T06:42:03Z WARN daminus_core::scan key [redacted:key] rejected',
    '',
  ].join('\n'),
}

/** The answer for `cmd`, or `undefined` when it is not one of these commands. */
export function diagnosticsAnswer(cmd: string): unknown {
  if (cmd === 'agent_status') return { ...AGENT }
  if (cmd === 'diagnostics_collect') return { ...DIAGNOSTICS }
  return undefined
}
