// The words for how a host's scan or test failed, the same everywhere a failed host is named
// (sidebar, rail, Overview, scan sheet, history), so "Unreachable" is said only of the network.
import type { HostOutcome } from '@/api'

export type OutcomeKey =
  | 'key_refused'
  | 'host_key_changed'
  | 'host_key_unknown'
  | 'unreachable'
  | 'timed_out'
  | 'not_in_config'

/** The `outcome.*` message of a failed host; a host with no outcome yet reads Unreachable. */
export function outcomeKey(outcome: HostOutcome | null | undefined): OutcomeKey {
  switch (outcome?.state) {
    case 'auth_failed':
      return 'key_refused'
    case 'host_key_changed':
      return 'host_key_changed'
    case 'host_key_unknown':
      return 'host_key_unknown'
    case 'timeout':
    case 'partial':
      return 'timed_out'
    case 'not_in_config':
      return 'not_in_config'
    default:
      return 'unreachable'
  }
}

/** Red for what the user must act on (a refused key, a changed host key), else quiet. */
export function outcomeTone(outcome: HostOutcome | null | undefined): 'crit' | 'warn' | 'quiet' {
  const key = outcomeKey(outcome)
  if (key === 'key_refused' || key === 'host_key_changed') return 'crit'
  if (key === 'host_key_unknown' || key === 'not_in_config') return 'warn'
  return 'quiet'
}
